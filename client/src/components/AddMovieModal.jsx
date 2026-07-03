import { useState } from 'react';
import { api } from '../api';
import { useAppConfig } from '../AppConfigContext';

export default function AddMovieModal({ onClose, onAdded }) {
  const { voters } = useAppConfig();
  const [title, setTitle]         = useState('');
  const [director, setDirector]   = useState('');
  const [year, setYear]           = useState('');
  const [mn, setMn]               = useState(false);
  const [watchlist, setWatchlist] = useState(false);
  const [ratings, setRatings]     = useState({});
  const [enabled, setEnabled]     = useState({});
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');
  const [createdMovieId, setCreatedMovieId] = useState(null);

  function toggleVoter(v) {
    setEnabled(e => ({ ...e, [v]: !e[v] }));
    if (!enabled[v]) setRatings(r => ({ ...r, [v]: r[v] ?? 5 }));
  }

  async function handleAdd() {
    if (!title.trim())    { setError('Film title is required.'); return; }
    if (!director.trim()) { setError('Director is required.'); return; }
    if (!year.trim())     { setError('Year is required.'); return; }
    setSaving(true);
    setError('');
    const ratingPayload = {};
    voters.forEach(v => { ratingPayload[v] = enabled[v] ? ratings[v] ?? 5 : null; });
    const hasRatings = Object.values(ratingPayload).some(v => v !== null);
    try {
      // Use existing createdMovieId if retrying after a failed updateMovie
      let movie;
      if (createdMovieId) {
        movie = { id: createdMovieId }; // just need the id for retry
      } else {
        movie = await api.createMovie({ title: title.trim(), director: director.trim(), year: year.trim(), mn, watchlist });
        setCreatedMovieId(movie.id);
      }
      if (hasRatings) {
        const updated = await api.updateMovie(movie.id, { ratings: ratingPayload });
        onAdded(updated);
      } else {
        onAdded(movie);
      }
      onClose();
    } catch (e) {
      if (createdMovieId) {
        setError('Ratings could not be saved. Click "Add Film" to retry, or close to save without ratings.');
      } else {
        setError(e.message);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <div className="modal-header-text">
            <div className="modal-title">Add Film</div>
            <div className="modal-sub">Add a film not currently in the list</div>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {error && <div style={{ color: 'var(--red)', marginBottom: 12, fontSize: 13 }}>{error}</div>}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ display: 'block', marginBottom: 6 }}>Film Title *</label>
              <input className="input" placeholder="e.g. The Seventh Seal" value={title} onChange={e => setTitle(e.target.value)} autoFocus />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 6 }}>Director *</label>
              <input className="input" placeholder="e.g. Bergman" value={director} onChange={e => setDirector(e.target.value)} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 6 }}>Year *</label>
              <input className="input" placeholder="e.g. 1957" value={year} onChange={e => setYear(e.target.value)} style={{ maxWidth: 140 }} />
            </div>
          </div>

          <div className="section-label" style={{ marginTop: 20 }}>Initial Ratings (optional)</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
            {voters.map(v => (
              <div key={v} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 40px 32px', gap: '0 10px', alignItems: 'center' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)' }}>{v}</span>
                <input
                  type="range" min={0} max={10} step={0.5}
                  value={enabled[v] ? ratings[v] ?? 5 : 0}
                  disabled={!enabled[v]}
                  style={{ width: '100%', accentColor: 'var(--gold)' }}
                  onChange={e => setRatings(r => ({ ...r, [v]: parseFloat(e.target.value) }))}
                />
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold)', textAlign: 'right' }}>
                  {enabled[v] ? (ratings[v] ?? 5) : '–'}
                </span>
                <button className="btn btn-sm btn-ghost" style={{ minWidth: 28 }} onClick={() => toggleVoter(v)}>
                  {enabled[v] ? '✕' : '+'}
                </button>
              </div>
            ))}
          </div>

          <div className="section-label" style={{ marginTop: 20 }}>Flags</div>
          <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
            <button className={`toggle-btn${mn ? ' active' : ''}`} onClick={() => setMn(x => !x)}>🎬 Movie Night</button>
            <button className={`toggle-btn${watchlist ? ' active' : ''}`} onClick={() => setWatchlist(x => !x)}>👁 Watchlist</button>
          </div>
        </div>

        <div className="modal-footer">
          {createdMovieId && (
            <button className="btn btn-ghost btn-sm" style={{ marginRight: 'auto' }}
              onClick={async () => {
                const movie = await api.getMovie(createdMovieId).catch(() => ({ id: createdMovieId }));
                onAdded(movie);
                onClose();
              }}
            >
              Close (film saved without ratings)
            </button>
          )}
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-gold" onClick={handleAdd} disabled={saving}>
            {saving ? 'Adding…' : 'Add Film'}
          </button>
        </div>
      </div>
    </div>
  );
}
