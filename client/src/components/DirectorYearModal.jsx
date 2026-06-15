import { useState, useEffect } from 'react';
import { api } from '../api';
import MovieCard from './MovieCard';
import MovieModal from './MovieModal';
import './DirectorYearModal.css';

function scoreClass(v) {
  if (v == null) return 'score-none';
  if (v >= 7.5) return 'score-high';
  if (v >= 5)   return 'score-mid';
  return 'score-low';
}

function fmt(v) {
  if (v == null) return '–';
  return v.toFixed(2).replace('.', ',');
}

export default function DirectorYearModal({ type, value, scoreKey = 'fairBoosted', mnOnly = false, onClose }) {
  const [films, setFilms]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [movieId, setMovieId] = useState(null);

  useEffect(() => {
    const param = type === 'director' ? { director: value } : { year: value };
    if (mnOnly) param.mn = '1';
    api.getMovies(param)
      .then(data => {
        const sorted = [...data]
          .filter(f => f.voterCount >= 2)
          .sort((a, b) => (b[scoreKey] ?? -1) - (a[scoreKey] ?? -1));
        setFilms(sorted);
      })
      .finally(() => setLoading(false));
  }, [type, value, scoreKey, mnOnly]);

  function handleSaved(updated) {
    setFilms(fs => fs.map(f => f.id === updated.id ? updated : f));
  }
  function handleDeleted(id) {
    setFilms(fs => fs.filter(f => f.id !== id));
  }

  const meanScore = films.length
    ? films.reduce((a, f) => a + (f[scoreKey] ?? 0), 0) / films.length
    : null;

  return (
    <div className="modal-overlay dy-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal dy-modal">
        <div className="modal-header">
          <div className="modal-header-text">
            <div className="modal-title">{value}</div>
            <div className="modal-sub">
              {type === 'director' ? 'Director' : 'Year'}
              {mnOnly ? ' · MN only' : ''}
              {' · '}
              {scoreKey === 'boostedScore' ? 'Group score' : 'Fair score'}
              {' · '}
              {films.length} film{films.length !== 1 ? 's' : ''}
            </div>
          </div>
          {meanScore != null && (
            <div className="dy-mean">
              <div className={`dy-mean-score ${scoreClass(meanScore)}`}>{fmt(meanScore)}</div>
              <div className="dy-mean-label">mean</div>
            </div>
          )}
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="dy-body">
          {loading ? (
            <div className="spinner" style={{ margin: '40px auto' }} />
          ) : films.length === 0 ? (
            <p style={{ color: 'var(--text2)', textAlign: 'center', padding: 40 }}>No films found.</p>
          ) : (
            <div className="films-list">
              {films.map(f => (
                <MovieCard
                  key={f.id}
                  movie={f}
                  listView
                  scoreMode={scoreKey === 'boostedScore' ? 'group' : 'fair'}
                  onClick={() => setMovieId(f.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {movieId && (
        <MovieModal
          movieId={movieId}
          onClose={() => setMovieId(null)}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  );
}
