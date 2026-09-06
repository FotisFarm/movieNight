import './WatchlistBadge.css';

export default function WatchlistBadge({ id, watchlist, onToggle, className = '' }) {
  if (!onToggle) {
    return watchlist ? <span className={`badge badge-wl ${className}`}>WL</span> : null;
  }

  const handleClick = (e) => {
    e.stopPropagation();
    onToggle(id, !watchlist);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      onToggle(id, !watchlist);
    }
  };

  if (watchlist) {
    return (
      <button
        type="button"
        className={`badge badge-wl badge-wl-toggle active ${className}`}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        title="In Watchlist (click to remove)"
        aria-label="Remove from Watchlist"
      >
        <span className="badge-wl-icon">✓</span> WL
      </button>
    );
  }

  return (
    <button
      type="button"
      className={`badge badge-wl-toggle ghost ${className}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      title="Add to Watchlist"
      aria-label="Add to Watchlist"
    >
      <span className="badge-wl-icon">+</span> WL
    </button>
  );
}
