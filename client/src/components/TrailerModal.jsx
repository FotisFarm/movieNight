import { useState, useEffect } from 'react';
import { api } from '../api';
import './TrailerModal.css';

export default function TrailerModal({ movie, onClose }) {
  const [trailer, setTrailer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!movie?.id) return;

    let mounted = true;
    setLoading(true);
    setError(null);

    api.getMovieTrailer(movie.id)
      .then((data) => {
        if (!mounted) return;
        if (data?.trailer) {
          setTrailer(data.trailer);
        } else {
          setTrailer(null);
        }
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err.message || 'Failed to load trailer');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [movie?.id]);

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!movie) return null;

  const ytSearchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(
    `${movie.title} ${movie.year || ''} trailer`.trim()
  )}`;

  return (
    <div className="trailer-modal-overlay" onClick={onClose}>
      <div className="trailer-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="trailer-modal-header">
          <div className="trailer-modal-info">
            <span className="trailer-modal-badge">▶ Trailer</span>
            <h2 className="trailer-modal-title">
              {movie.title}
              {movie.year ? <span className="trailer-modal-year"> ({movie.year})</span> : null}
            </h2>
            {trailer?.name && (
              <span className="trailer-modal-tag" title={trailer.name}>
                {trailer.name}
              </span>
            )}
          </div>
          <div className="trailer-modal-actions">
            {trailer?.youtubeUrl && (
              <a
                href={trailer.youtubeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="trailer-ext-link"
                title="Watch directly on YouTube"
              >
                YouTube ↗
              </a>
            )}
            <button className="trailer-modal-close" onClick={onClose} aria-label="Close trailer">
              ✕
            </button>
          </div>
        </div>

        <div className="trailer-player-wrap">
          {loading ? (
            <div className="trailer-state-box">
              <div className="spinner" />
              <p>Finding official trailer...</p>
            </div>
          ) : trailer?.embedUrl ? (
            <iframe
              className="trailer-iframe"
              src={`${trailer.embedUrl}?autoplay=1&rel=0`}
              title={`${movie.title} trailer`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <div className="trailer-state-box">
              <span className="trailer-empty-icon">🎬</span>
              <p className="trailer-empty-text">
                {error || 'No official trailer found for this title on TMDb.'}
              </p>
              <a
                href={ytSearchUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary btn-sm trailer-fallback-btn"
              >
                Search on YouTube ↗
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
