'use client';

import { useState, useEffect } from 'react';

export default function StockbitFetchingIndicator() {
  const [isFetching, setIsFetching] = useState(false);

  useEffect(() => {
    const handleStart = () => setIsFetching(true);
    const handleEnd = () => setIsFetching(false);

    window.addEventListener('stockbit-fetch-start', handleStart);
    window.addEventListener('stockbit-fetch-end', handleEnd);

    return () => {
      window.removeEventListener('stockbit-fetch-start', handleStart);
      window.removeEventListener('stockbit-fetch-end', handleEnd);
    };
  }, []);

  if (!isFetching) return null;

  return (
    <div className="token-status-pill" style={{ cursor: 'default' }}>
      <div className="token-dot warning" style={{ animation: 'pulse 1.5s infinite' }} />
      <span style={{ 
        color: 'var(--accent-orange)',
        whiteSpace: 'nowrap'
      }}>
        Stockbit Fetching
      </span>
    </div>
  );
}
