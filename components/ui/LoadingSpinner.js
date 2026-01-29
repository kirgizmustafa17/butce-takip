'use client';

export default function LoadingSpinner({ size = 'md', text = '' }) {
  const sizeMap = {
    sm: 20,
    md: 32,
    lg: 48,
  };

  const spinnerSize = sizeMap[size] || sizeMap.md;

  return (
    <div className="flex flex-col items-center justify-center gap-md" style={{ padding: 'var(--spacing-xl)' }}>
      <svg 
        width={spinnerSize} 
        height={spinnerSize} 
        viewBox="0 0 24 24" 
        xmlns="http://www.w3.org/2000/svg"
        style={{ animation: 'spin 1s linear infinite' }}
      >
        <style>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
        <circle 
          cx="12" 
          cy="12" 
          r="10" 
          stroke="var(--bg-tertiary)" 
          strokeWidth="3" 
          fill="none"
        />
        <path 
          d="M12 2a10 10 0 0 1 10 10" 
          stroke="var(--accent-primary)" 
          strokeWidth="3" 
          strokeLinecap="round"
          fill="none"
        />
      </svg>
      {text && <p className="text-secondary">{text}</p>}
    </div>
  );
}
