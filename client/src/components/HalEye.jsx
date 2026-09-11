import React from 'react';
import './HalEye.css';

export default function HalEye({ size = 26, active = false, className = '' }) {
  const gradId = React.useId().replace(/:/g, '');

  return (
    <div
      className={`hal-eye-wrap ${active ? 'hal-eye-active' : ''} ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg
        className="hal-eye-svg"
        viewBox="0 0 40 40"
        width={size}
        height={size}
      >
        <defs>
          <radialGradient id={`halLens-${gradId}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fff8d6" />
            <stop offset="18%" stopColor="#ff5a36" />
            <stop offset="55%" stopColor="#c41414" />
            <stop offset="85%" stopColor="#520505" />
            <stop offset="100%" stopColor="#1a0202" />
          </radialGradient>
          <radialGradient id={`halGlow-${gradId}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(255, 60, 40, 0.45)" />
            <stop offset="70%" stopColor="rgba(255, 20, 20, 0.1)" />
            <stop offset="100%" stopColor="rgba(255, 20, 20, 0)" />
          </radialGradient>
        </defs>

        {/* Outer bezel */}
        <circle cx="20" cy="20" r="19.5" fill="#0b0b0e" stroke="#2c2d38" strokeWidth="1" />
        <circle cx="20" cy="20" r="16.5" fill="#13141a" stroke="#1f2029" strokeWidth="0.8" />

        {/* Glow halo when active */}
        {active && (
          <circle cx="20" cy="20" r="18" fill={`url(#halGlow-${gradId})`} className="hal-eye-radiance" />
        )}

        {/* Main iris lens */}
        <circle cx="20" cy="20" r="12" fill={`url(#halLens-${gradId})`} className="hal-eye-lens" />

        {/* Inner pupil core */}
        <circle cx="20" cy="20" r="4.2" fill="#fff5d0" opacity={active ? 0.95 : 0.85} className="hal-eye-core" />

        {/* Lens reflection glints */}
        <circle cx="16" cy="16" r="2" fill="#ffffff" opacity="0.9" />
        <ellipse cx="23" cy="24" rx="1.2" ry="0.8" fill="#ffffff" opacity="0.25" />
      </svg>
    </div>
  );
}
