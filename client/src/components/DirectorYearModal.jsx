import { useState, useEffect, useMemo } from 'react';
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

function buildRankMap(allMovies) {
  const rated   = allMovies.filter(m => m.voterCount >= 2);
  const ratedMn = rated.filter(m => m.mn);
  function tiebreak(a, b) {
    if (b.voterCount !== a.voterCount) return b.voterCount - a.voterCount;
    if ((b.boost ?? 0) !== (a.boost ?? 0)) return (b.boost ?? 0) - (a.boost ?? 0);
    return (parseInt(a.year) || 9999) - (parseInt(b.year) || 9999);
  }
  const byFair  = (a, b) => (b.fairBoosted  - a.fairBoosted)  || tiebreak(a, b);
  const byGroup = (a, b) => (b.boostedScore - a.boostedScore) || tiebreak(a, b);
  const toMap   = arr => { const m = {}; arr.forEach((x, i) => { m[x.id] = i + 1; }); return m; };
  return {
    fair:    toMap([...rated].sort(byFair)),
    group:   toMap([...rated].sort(byGroup)),
    mnFair:  toMap([...ratedMn].sort(byFair)),
    mnGroup: toMap([...ratedMn].sort(byGroup)),
  };
}

export default function DirectorYearModal({ type, value, scoreKey = 'fairBoosted', mnOnly = false, voter = null, onClose }) {
  const [films, setFilms]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [movieId, setMovieId]   = useState(null);
  const [allMovies, setAllMovies] = useState([]);

  useEffect(() => {
    api.getMovies({}).then(setAllMovies);
  }, []);

  const rankMap = useMemo(() => buildRankMap(allMovies), [allMovies]);

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
                  movie={f}
                  listView
                  scoreMode={scoreKey === 'boostedScore' ? 'group' : 'fair'}
                  rank_global={scoreKey === 'boostedScore' ? (rankMap.group[f.id] ?? null) : (rankMap.fair[f.id] ?? null)}
                  mn_rank={scoreKey === 'boostedScore' ? (rankMap.mnGroup[f.id] ?? null) : (rankMap.mnFair[f.id] ?? null)}
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
