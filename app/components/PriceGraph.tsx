'use client';

import { useEffect, useRef } from 'react';

interface PriceGraphProps {
  ticker: string;
}

export default function PriceGraph({ ticker }: PriceGraphProps) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!container.current) return;

    // Clean up previous widget if any
    container.current.innerHTML = '';

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;
    script.innerHTML = JSON.stringify({
      "autosize": true,
      "symbol": `IDX:${ticker.toUpperCase()}`,
      "interval": "D",
      "timezone": "Asia/Jakarta",
      "theme": "dark",
      "style": "1",
      "locale": "en",
      "allow_symbol_change": true,
      "calendar": false,
      "support_host": "https://www.tradingview.com"
    });

    container.current.appendChild(script);
  }, [ticker]);

  return (
    <div className="glass-card mt-4" style={{ 
      padding: '0', 
      overflow: 'hidden',
      height: '600px',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      background: '#131722' // Matching TradingView's dark theme
    }}>
      <div 
        id="tradingview_widget"
        ref={container}
        className="tradingview-widget-container" 
        style={{ height: "100%", width: "100%" }}
      >
        <div className="tradingview-widget-container__widget" style={{ height: "100%", width: "100%" }}></div>
      </div>
    </div>
  );
}
