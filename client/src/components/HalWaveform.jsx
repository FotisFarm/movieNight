import React from 'react';
import './HalWaveform.css';

export default function HalWaveform({ active = false, bars = 9, className = '' }) {
  return (
    <div className={`hal-waveform ${active ? 'hal-waveform-active' : ''} ${className}`} aria-hidden="true">
      {Array.from({ length: bars }).map((_, i) => (
        <span
          key={i}
          className="hal-waveform-bar"
          style={{
            animationDelay: `${(i * 0.08).toFixed(2)}s`,
            animationDuration: active ? `${0.45 + (i % 3) * 0.15}s` : '1.8s',
          }}
        />
      ))}
    </div>
  );
}
