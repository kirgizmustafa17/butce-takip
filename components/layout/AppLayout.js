'use client';

import { useState } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import { ToastProvider } from '@/components/ui/Toast';

export default function AppLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <ToastProvider>
      <div className="app-container">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main className="main-content">
          <Header 
            title="Dashboard" 
            onMenuClick={() => setSidebarOpen(!sidebarOpen)} 
          />
          {children}
        </main>
      </div>
    </ToastProvider>
  );
}
