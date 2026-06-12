import { useState, useEffect } from 'react';
import { api } from '../api';
import MovieModal from '../components/MovieModal';
import { useToast } from '../hooks/useToast.jsx';
import './Watchlist.css';

function fmt(v) {
  if (v == null) return null;
  return v.toFixed(2).replace('.', ',') + '/10';
}

export default function Watchlist() {
  const [movies, setMovies]         = useState([]);
  const [loading, setLoading]       = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const { toast, Toast }            = useToast();

  useEffect(() => {
    api.getMovies({ watchlist: '1' })
      .then(setMovies)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  async function toggleCinobo(movie) {
    const updated = await api.updateMovie(movie.id, {
      cinobo: movie.cinobo === 'Yes' ? 'No' : 'Yes',
    });
    setMovies(ms => ms.map(m => m.id === updated.id ? updated : m));
  }

  async function removeFromWatchlist(id) {
    const updated = await api.updateMovie(id, { watchlist: false });
    setMovies(ms => ms.filter(m => m.id !== id));
    toast('Removed from watchlist');
    return updated;
  }

  function handleSaved(updated) {
    if (!updated.watchlist) {
      setMovies(ms => ms.filter(m => m.id !== updated.id));
    } else {
      setMovies(ms => ms.map(m => m.id === updated.id ? updated : m));
    }
    toast('Saved!');
  }

  if (loading) return <div className="spinner" />;

  return (
    <div>
      <div className="wl-header">
        <h2 className="wl-title">Watchlist <span>{movies.length}</span></h2>
        <p className="wl-desc">Open any film and toggle the Watchlist flag to add it here.</p>
      </div>

      {movies.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">👁</div>
          <div className="empty-title">Watchlist is empty</div>
          <div>Go to Films and click any card to add it</div>
        </div>
      ) : (
        <div className="wl-grid">
          {movies.map(m => (
            <div key={m.id} className="wl-card">
              <div className="wl-card-body" onClick={() => setSelectedId(m.id)}>
                <div className="wl-movie-title">{m.title}</div>
                <div className="wl-movie-meta">{m.director} · {m.year || '?'}</div>
                {m.fairScore != null && (
                  <div className="wl-score">
                    Fair avg: <strong>{fmt(m.fairScore)}</strong>
                  </div>
                )}
              </div>
              <div className="wl-card-actions">
                <button
                  className={`cinobo-btn ${m.cinobo === 'Yes' ? 'cinobo-yes' : 'cinobo-no'}`}
                  onClick={() => toggleCinobo(m)}
                  title="Toggle Cinobo availability"
                >
                  {m.cinobo === 'Yes' ? '✓ Cinobo' : '✗ Cinobo'}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setSelectedId(m.id)}>
                  Rate
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ color: 'var(--text3)' }}
                  onClick={() => removeFromWatchlist(m.id)}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedId && (
        <MovieModal
          movieId={selectedId}
          onClose={() => setSelectedId(null)}
          onSaved={handleSaved}
          onDeleted={id => { setMovies(ms => ms.filter(m => m.id !== id)); setSelectedId(null); }}
        />
      )}
      <Toast />
    </div>
  );
}
