'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const success = await login(password);
      if (!success) {
        setError('Hatalı şifre');
        setPassword('');
      }
    } catch (err) {
      setError('Giriş yapılırken bir hata oluştu');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-primary)',
      padding: 'var(--spacing-lg)',
    }}>
      <div style={{
        width: '100%',
        maxWidth: '400px',
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--border-radius-xl)',
        padding: 'var(--spacing-2xl)',
        backdropFilter: 'blur(10px)',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 'var(--spacing-xl)' }}>
          <svg width="64" height="64" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ margin: '0 auto var(--spacing-md)' }}>
            <rect width="32" height="32" rx="8" fill="url(#paint0_linear)"/>
            <path d="M8 16L14 10L20 16L14 22L8 16Z" fill="white" fillOpacity="0.9"/>
            <path d="M14 16L20 10L26 16L20 22L14 16Z" fill="white" fillOpacity="0.6"/>
            <defs>
              <linearGradient id="paint0_linear" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
                <stop stopColor="#6366F1"/>
                <stop offset="1" stopColor="#8B5CF6"/>
              </linearGradient>
            </defs>
          </svg>
          <h1 style={{ 
            fontSize: '1.75rem', 
            fontWeight: 700, 
            marginBottom: 'var(--spacing-xs)',
            background: 'var(--gradient-primary)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>
            Bütçe Takip
          </h1>
          <p className="text-secondary">Devam etmek için şifrenizi girin</p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Şifre</label>
            <input
              type="password"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoFocus
              required
              style={{ 
                textAlign: 'center', 
                fontSize: '1.25rem',
                letterSpacing: '0.2em'
              }}
            />
          </div>

          {error && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid var(--accent-danger)',
              borderRadius: 'var(--border-radius-md)',
              padding: 'var(--spacing-md)',
              marginBottom: 'var(--spacing-md)',
              color: 'var(--accent-danger)',
              textAlign: 'center',
              fontSize: '0.875rem',
            }}>
              {error}
            </div>
          )}

          <button 
            type="submit" 
            className="btn btn-primary btn-lg"
            disabled={loading}
            style={{ width: '100%' }}
          >
            {loading ? (
              <span>Giriş yapılıyor...</span>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="20" height="20">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                </svg>
                Giriş Yap
              </>
            )}
          </button>
        </form>

        <p className="text-muted" style={{ 
          textAlign: 'center', 
          marginTop: 'var(--spacing-xl)',
          fontSize: '0.75rem' 
        }}>
          🔒 Oturum 30 dakika işlem yapılmadığında otomatik kapanır
        </p>
      </div>
    </div>
  );
}
