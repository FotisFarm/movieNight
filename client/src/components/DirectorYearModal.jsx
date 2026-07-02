import { useState, useEffect } from 'react';
import { api } from '../api';
import MovieCard from './MovieCard';
import MovieModal from './MovieModal';
import { fmt, scoreClass } from '../utils';
import { useRankMap } from '../hooks/useRankMap';
import './DirectorYearModal.css';

export default function DirectorYearModal({ type, value, scoreKey = 'fairBoosted', mnOnly = false, voter = null, onClose }) {
  const [films, setFilms]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [movieId, setMovieId]   = useState(null);
  const [allMovies, setAllMovies] = useState([]);

  useEffect(() => {
    api.getMovies({}).then(setAllMovies);
  }, []);

  const rankMap = useRankMap(allMovies);

  useEffect(() => {
    const param =
      type === 'director' ? { director: value }
      : type === 'decade' ? { yearMin: value, yearMax: value + 9 }
      : { year: value };
    if (mnOnly) param.mn = '1';
    api.getMovies(param)
      .then(data => {
        const sorted = voter
          ? [...data].filter(f => f.ratings?.[voter] != null).sort((a, b) => b.ratings[voter] - a.ratings[voter])
          : [...data].filter(f => f.voterCount >= 2).sort((a, b) => (b[scoreKey] ?? -1) - (a[scoreKey] ?? -1));
        setFilms(sorted);
      })
      .finally(() => setLoading(false));
  }, [type, value, scoreKey, mnOnly, voter]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape' && !movieId) onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, movieId]);

  function handleSaved(updated) {
    setFilms(fs => fs.map(f => f.id === updated.id ? updated : f));
    setAllMovies(ms => ms.map(m => m.id === updated.id ? updated : m));
  }
  function handleDeleted(id) {
    setFilms(fs => fs.filter(f => f.id !== id));
  }

  const meanScore = films.length
    ? films.reduce((a, f) => a + (voter ? f.ratings[voter] : (f[scoreKey] ?? 0)), 0) / films.length
    : null;

  return (
    <div className="modal-overlay dy-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal dy-modal">
        <div className="modal-header">
          <div className="modal-header-text">
            <div className="modal-title">{type === 'decade' ? `${value}s` : value}</div>
            <div className="modal-sub">
              {type === 'director' ? 'Director' : type === 'decade' ? 'Decade' : 'Year'}
              {mnOnly ? ' · MN only' : ''}
              {' · '}
              {voter ? `${voter}'s score` : scoreKey === 'boostedScore' ? 'Group score' : 'Fair score'}
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
                  movie={{
                    ...f,
                    rank_global: scoreKey === 'boostedScore' ? (rankMap.group[f.id]   ?? null) : (rankMap.fair[f.id]    ?? null),
                    mn_rank:     scoreKey === 'boostedScore' ? (rankMap.mnGroup[f.id] ?? null) : (rankMap.mnFair[f.id]  ?? null),
                  }}
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
