import { useState, useEffect } from 'react';
import { api } from '../api';
import MovieModal from '../components/MovieModal';
import { useToast } from '../hooks/useToast.jsx';
import './Watchlist.css';

const VOTERS = ['Μητσέας', 'Παντελής', 'Στέλιας', 'Φώτης', 'Λεόντιος'];

function fmt(v) {
  if (v == null) return null;
  return v.toFixed(2).replace('.', ',') + '/10';
}

function sortByVotes(a, b) {
  const vDiff = (b.watchlistVotes?.length ?? 0) - (a.watchlistVotes?.length ?? 0);
  if (vDiff !== 0) return vDiff;
  return (b.voterCount ?? 0) - (a.voterCount ?? 0);
}

export default function Watchlist({ voter }) {
  const [movies, setMovies]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const { toast, Toast }        = useToast();

  useEffect(() => {
    api.getMovies({ watchlist: '1' })
      .then(ms => setMovies(ms.slice().sort(sortByVotes)))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  async function toggleVote(movie) {
    const hasVoted = movie.watchlistVotes?.includes(voter);
    setMovies(ms => ms.map(m => {
      if (m.id !== movie.id) return m;
      const votes = hasVoted
        ? m.watchlistVotes.filter(v => v !== voter)
        : [...(m.watchlistVotes ?? []), voter];
      return { ...m, watchlistVotes: votes };
    }).slice().sort(sortByVotes));
    await api.toggleWatchlistVote(movie.id);
  }

  async function toggleCinobo(movie) {
    const updated = await api.updateMovie(movie.id, {
      cinobo: movie.cinobo === 'Yes' ? 'No' : 'Yes',
    });
    setMovies(ms => ms.map(m => m.id === updated.id ? { ...updated, watchlistVotes: m.watchlistVotes } : m));
  }

  async function removeFromWatchlist(id) {
    await api.updateMovie(id, { watchlist: false });
    setMovies(ms => ms.filter(m => m.id !== id));
    toast('Removed from watchlist');
  }

  function handleSaved(updated) {
    if (!updated.watchlist) {
      setMovies(ms => ms.filter(m => m.id !== updated.id));
    } else {
      setMovies(ms => ms.map(m => m.id === updated.id
        ? { ...updated, watchlistVotes: m.watchlistVotes }
        : m
      ).slice().sort(sortByVotes));
    }
    toast('Saved!');
  }

  if (loading) return <div className="spinner" />;

  const ranked = movies.filter(m => (m.watchlistVotes?.length ?? 0) > 0);

  return (
    <div>
      <div className="wl-header">
        <h2 className="wl-title">Watchlist <span>{movies.length}</span></h2>
      </div>

      {ranked.length > 0 && (
        <div className="wl-ranking">
          <div className="wl-ranking-title">Most Wanted</div>
          <ol className="wl-ranking-list">
            {ranked.map((m, i) => (
              <li key={m.id} className="wl-ranking-row" onClick={() => setSelectedId(m.id)}>
                <span className="wl-ranking-pos">{i + 1}</span>
                <div className="wl-ranking-info">
                  <span className="wl-ranking-name">{m.title}</span>
                  <span className="wl-ranking-meta">{m.director} · {m.year || '?'}</span>
                </div>
                <div className="wl-ranking-voters">
                  {VOTERS.map(v => m.watchlistVotes.includes(v) && (
                    <span key={v} className="wl-vote-pill">{v}</span>
                  ))}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      {movies.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">👁</div>
          <div className="empty-title">Watchlist is empty</div>
          <div>Go to Films and click any card to add it</div>
        </div>
      ) : (
        <div className="wl-grid">
          {movies.map(m => {
            const hasVoted = m.watchlistVotes?.includes(voter);
            return (
              <div key={m.id} className="wl-card">
                <div className="wl-card-body" onClick={() => setSelectedId(m.id)}>
                  <div className="wl-card-top">
                    <div className="wl-movie-title">{m.title}</div>
                    {(m.watchlistVotes?.length ?? 0) > 0 && (
                      <span className="wl-vote-badge">{m.watchlistVotes.length}</span>
                    )}
                  </div>
                  <div className="wl-movie-meta">{m.director} · {m.year || '?'}</div>
                  {m.fairScore != null && (
                    <div className="wl-score">Fair avg: <strong>{fmt(m.fairScore)}</strong></div>
                  )}
                </div>
                <div className="wl-card-actions">
                  <button
                    className={`wl-vote-btn ${hasVoted ? 'wl-vote-on' : ''}`}
                    onClick={() => toggleVote(m)}
                  >
                    {hasVoted ? '★ Voted' : '☆ Vote'}
                  </button>
                  <button
                    className={`cinobo-btn ${m.cinobo === 'Yes' ? 'cinobo-yes' : 'cinobo-no'}`}
                    onClick={() => toggleCinobo(m)}
                    title="Toggle Cinobo availability"
                  >
                    {m.cinobo === 'Yes' ? '✓ Cinobo' : '✗ Cinobo'}
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setSelectedId(m.id)}>Rate</button>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ color: 'var(--text3)' }}
                    onClick={() => removeFromWatchlist(m.id)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
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
