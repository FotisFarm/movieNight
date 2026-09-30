import { useState } from 'react';
import './UserAvatar.css';

export default function UserAvatar({
  name = '',
  avatarUrl = null,
  size = 28,
  className = '',
  style = {},
  title = '',
}) {
  const [hasError, setHasError] = useState(false);
  const initials = (name || '').slice(0, 2).toUpperCase();
  const showImage = Boolean(avatarUrl && !hasError);

  return (
    <div
      className={`user-avatar-circle ${showImage ? 'has-img' : ''} ${className}`}
      style={{
        width: size,
        height: size,
        minWidth: size,
        minHeight: size,
        fontSize: Math.max(9, Math.round(size * 0.4)),
        ...style,
      }}
      title={title || name}
      aria-label={name}
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
  );
}
