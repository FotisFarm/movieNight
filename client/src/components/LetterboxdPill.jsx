import { useState, useRef } from 'react';
import './LetterboxdPill.css';

export default function LetterboxdPill({ imdbId, score }) {
  const [showPopover, setShowPopover] = useState(false);
  const closeTimer = useRef(null);

  if (!imdbId && score == null) return null;

  function handleMouseEnter() {
    clearTimeout(closeTimer.current);
    setShowPopover(true);
  }

  function handleMouseLeave() {
    closeTimer.current = setTimeout(() => {
      setShowPopover(false);
    }, 220);
  }

  const formattedScore = score != null && !isNaN(score)
    ? `${Number(score).toFixed(1)} ★`
    : null;

  return (
    <div
      className="lb-pill-wrapper"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <a
        href={imdbId ? `https://letterboxd.com/imdb/${imdbId}/` : undefined}
        className="badge-letterboxd-pill"
        target="_blank"
        rel="noopener noreferrer"
        onClick={e => e.stopPropagation()}
        title="View on Letterboxd · hover for rating histogram"
      >
        <span className="letterboxd-pill-badge">
          <span className="letterboxd-dots">
            <span className="lb-dot lb-dot-orange" />
            <span className="lb-dot lb-dot-green" />
            <span className="lb-dot lb-dot-blue" />
          </span>
          <span className="lb-text">LB</span>
        </span>
        {formattedScore && (
          <span className="letterboxd-rating-val">{formattedScore}</span>
        )}
      </a>

      {showPopover && imdbId && (
        <div
          className="lb-popover"
          onClick={e => e.stopPropagation()}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <iframe
            src={`https://embed.letterboxd.com/imdb/${imdbId}/embed-histogram/?theme=dark&notitle=true`}
            width="250"
            height="90"
            frameBorder="0"
            scrolling="no"
            title="Letterboxd Histogram"
          />
        </div>
      )}
    </div>
  );
}
