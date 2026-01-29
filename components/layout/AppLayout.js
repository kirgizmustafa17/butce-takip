'use client';

import { useState } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import { ToastProvider } from '../ui/Toast';
import { AuthProvider, useAuth } from '@/lib/auth';
import LoginPage from '@/components/auth/LoginPage';

function ProtectedLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { isAuthenticated, isLoading, logout } = useAuth();

  if (isLoading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-primary)',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div className="skeleton" style={{ 
            width: 60, 
            height: 60, 
            borderRadius: '50%', 
            margin: '0 auto var(--spacing-md)' 
          }}></div>
          <p className="text-secondary">Yükleniyor...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <div className="app-container">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="main-content">
        <Header 
          title={getPageTitle()} 
          onMenuClick={() => setSidebarOpen(true)} 
          onLogout={logout}
        />
        <div className="page-content">
          {children}
        </div>
      </main>
    </div>
  );
}

function getPageTitle() {
  if (typeof window === 'undefined') return 'Dashboard';
  
  const path = window.location.pathname;
  const titles = {
    '/': 'Dashboard',
    '/hesaplar': 'Banka Hesapları',
    '/kartlar': 'Kredi Kartları',
    '/yatirimlar': 'Yatırımlar',
    '/nakit-akisi': 'Nakit Akışı',
    '/odemeler': 'Planlı Ödemeler',
  };
  return titles[path] || 'Dashboard';
}

export default function AppLayout({ children }) {
  return (
    <AuthProvider>
      <ToastProvider>
        <ProtectedLayout>{children}</ProtectedLayout>
      </ToastProvider>
    </AuthProvider>
  );
}
