import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import './UserAvatar.css';

export default function UserAvatar({
  name = '',
  avatarUrl = null,
  size = 28,
  className = '',
  style = {},
  title = '',
  zoomable = false,
  onClick = null,
}) {
  const [hasError, setHasError] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);
  const initials = (name || '').slice(0, 2).toUpperCase();
  const showImage = Boolean(avatarUrl && !hasError);

  useEffect(() => {
    setHasError(false);
  }, [avatarUrl]);

  useEffect(() => {
    if (!isZoomed) return;
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        setIsZoomed(false);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isZoomed]);

  function handleClick(e) {
    if (onClick) onClick(e);
    if (zoomable) {
      e.stopPropagation();
      setIsZoomed(true);
    }
  }

  const tooltipText = title || (zoomable ? `${name} (Click to zoom)` : name);

  return (
    <>
      <div
        className={`user-avatar-circle ${showImage ? 'has-img' : ''} ${zoomable ? 'is-zoomable' : ''} ${className}`}
        style={{
          width: size,
          height: size,
          minWidth: size,
          minHeight: size,
          fontSize: Math.max(9, Math.round(size * 0.4)),
          cursor: zoomable ? 'pointer' : (style.cursor || 'inherit'),
          ...style,
        }}
        title={tooltipText}
        aria-label={name}
        onClick={handleClick}
        role={zoomable ? 'button' : undefined}
        tabIndex={zoomable ? 0 : undefined}
        onKeyDown={zoomable ? (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            setIsZoomed(true);
          }
        } : undefined}
      >
        {showImage ? (
          <img
            src={avatarUrl}
            alt={name}
            className="user-avatar-img"
            onError={() => setHasError(true)}
            loading="lazy"
          />
        ) : (
          <span className="user-avatar-initials">{initials}</span>
        )}
      </div>

      {isZoomed && createPortal(
        <div
          className="avatar-zoom-overlay"
          onClick={() => setIsZoomed(false)}
          role="dialog"
          aria-modal="true"
          aria-label={`Profile picture of ${name}`}
        >
          <div className="avatar-zoom-dialog" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="avatar-zoom-close"
              onClick={() => setIsZoomed(false)}
              aria-label="Close zoomed profile picture"
            >
              ✕
            </button>
            <div className="avatar-zoom-preview-wrap" onClick={() => setIsZoomed(false)}>
              {showImage ? (
                <img
                  src={avatarUrl}
                  alt={name}
                  className="avatar-zoom-img"
                />
              ) : (
                <div className="avatar-zoom-initials">
                  {initials}
                </div>
              )}
            </div>
            {name && <div className="avatar-zoom-name">{name}</div>}
            <div className="avatar-zoom-hint">Click anywhere or press Esc to close</div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
