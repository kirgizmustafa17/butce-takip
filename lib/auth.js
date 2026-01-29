'use client';

import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext({
  isAuthenticated: false,
  isLoading: true,
  login: async () => false,
  logout: () => {},
  lastActivity: null,
});

// Session timeout in milliseconds (30 minutes)
const SESSION_TIMEOUT = 30 * 60 * 1000;
const SESSION_KEY = 'butce_takip_session';
const ACTIVITY_KEY = 'butce_takip_last_activity';

export function AuthProvider({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [lastActivity, setLastActivity] = useState(null);

  // Check session on mount
  useEffect(() => {
    checkSession();
    
    // Set up activity tracking
    const handleActivity = () => {
      if (isAuthenticated) {
        const now = Date.now();
        setLastActivity(now);
        localStorage.setItem(ACTIVITY_KEY, now.toString());
      }
    };

    // Track user activity
    window.addEventListener('click', handleActivity);
    window.addEventListener('keypress', handleActivity);
    window.addEventListener('scroll', handleActivity);

    return () => {
      window.removeEventListener('click', handleActivity);
      window.removeEventListener('keypress', handleActivity);
      window.removeEventListener('scroll', handleActivity);
    };
  }, [isAuthenticated]);

  // Check for session timeout
  useEffect(() => {
    if (!isAuthenticated) return;

    const checkTimeout = setInterval(() => {
      const lastActivityTime = parseInt(localStorage.getItem(ACTIVITY_KEY) || '0');
      if (Date.now() - lastActivityTime > SESSION_TIMEOUT) {
        logout();
      }
    }, 60000); // Check every minute

    return () => clearInterval(checkTimeout);
  }, [isAuthenticated]);

  function checkSession() {
    try {
      const session = localStorage.getItem(SESSION_KEY);
      const lastActivityTime = parseInt(localStorage.getItem(ACTIVITY_KEY) || '0');
      
      if (session && Date.now() - lastActivityTime < SESSION_TIMEOUT) {
        setIsAuthenticated(true);
        setLastActivity(lastActivityTime);
      } else {
        // Clear expired session
        localStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(ACTIVITY_KEY);
        setIsAuthenticated(false);
      }
    } catch (error) {
      console.error('Session check error:', error);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  }

  async function login(password) {
    try {
      // Get password from environment variable (set in Vercel)
      const correctPassword = process.env.NEXT_PUBLIC_APP_PASSWORD;
      
      if (!correctPassword) {
        console.warn('APP_PASSWORD not configured');
        // If no password is set, allow access (development mode)
        const now = Date.now();
        localStorage.setItem(SESSION_KEY, 'authenticated');
        localStorage.setItem(ACTIVITY_KEY, now.toString());
        setIsAuthenticated(true);
        setLastActivity(now);
        return true;
      }

      if (password === correctPassword) {
        const now = Date.now();
        localStorage.setItem(SESSION_KEY, 'authenticated');
        localStorage.setItem(ACTIVITY_KEY, now.toString());
        setIsAuthenticated(true);
        setLastActivity(now);
        return true;
      }

      return false;
    } catch (error) {
      console.error('Login error:', error);
      return false;
    }
  }

  function logout() {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(ACTIVITY_KEY);
    setIsAuthenticated(false);
    setLastActivity(null);
  }

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, login, logout, lastActivity }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
