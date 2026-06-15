import { useState, useEffect } from 'react';
import { api } from '../api';
import './MovieModal.css';

const VOTERS = ['Μητσέας', 'Παντελής', 'Στέλιας', 'Φώτης', 'Λεόντιος'];
const GROUP_SIZE = 5;
const MEDALS = { 1: '🥇', 2: '🥈', 3: '🥉' };

function fmt(v) {
  if (v == null) return '–';
  return v.toFixed(2).replace('.', ',') + '/10';
}

function scoreClass(v) {
  if (v == null) return 'score-none';
  if (v >= 7.5) return 'score-high';
  if (v >= 5)   return 'score-mid';
  return 'score-low';
}

function voterCountClass(n) {
  if (n === 5)      return 'score-high';
  if (n >= 2)       return 'score-orange';
  return 'score-low';
}

function rankClass(r) {
  if (!r || r > 100) return 'score-low';
  if (r > 50)        return 'score-orange';
  if (r > 25)        return 'score-mid';
  return 'score-high';
}

export default function MovieModal({ movieId, onClose, onSaved, onDeleted }) {
  const [movie, setMovie]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);

  const [ratings,  setRatings]  = useState({});  // voter -> number | null
  const [comments, setComments] = useState({});  // voter -> string
  const [top3,     setTop3]     = useState({});  // voter -> 1|2|3|null
  const [mn,       setMn]       = useState(false);
  const [watchlist, setWatchlist] = useState(false);
  const [editing,      setEditing]      = useState(false);
  const [editTitle,    setEditTitle]    = useState('');
  const [editDirector, setEditDirector] = useState('');
  const [editYear,     setEditYear]     = useState('');

  useEffect(() => {
    if (!movieId) return;
    setLoading(true);
    api.getMovie(movieId).then(m => {
      setMovie(m);
      const r = {}, c = {}, t = {};
      VOTERS.forEach(v => {
        r[v] = m.ratings?.[v] ?? null;
        c[v] = m.comments?.[v] ?? '';
        t[v] = m.top3?.[v] ?? null;
      });
      setRatings(r);
      setComments(c);
      setTop3(t);
      setMn(m.mn);
      setWatchlist(m.watchlist);
      setEditTitle(m.title || '');
      setEditDirector(m.director || '');
      setEditYear(m.year || '');
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [movieId]);

  function toggleVoter(voter) {
    setRatings(r => ({ ...r, [voter]: r[voter] == null ? 5 : null }));
  }

  function setScore(voter, val) {
    const n = parseFloat(val);
    if (isNaN(n)) return;
    setRatings(r => ({ ...r, [voter]: Math.min(10, Math.max(0, n)) }));
  }

  function toggleTop3(voter, rank) {
    setTop3(t => ({ ...t, [voter]: t[voter] === rank ? null : rank }));
  }

  async function handleSave() {
    setSaving(true);
    const ratingPayload = {}, commentPayload = {}, top3Payload = {};
    VOTERS.forEach(v => {
      ratingPayload[v] = ratings[v];
      if (ratings[v] != null) commentPayload[v] = comments[v];
      top3Payload[v] = top3[v] ?? null;
    });

    try {
      const updated = await api.updateMovie(movieId, {
        title: editTitle.trim(),
        director: editDirector.trim(),
        year: editYear.trim(),
        mn,
        watchlist,
        ratings: ratingPayload,
        comments: commentPayload,
        top3: top3Payload,
      });
      onSaved(updated);
      onClose();
    } catch (e) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${movie?.title}"?`)) return;
    await api.deleteMovie(movieId);
    onDeleted(movieId);
    onClose();
  }

  if (loading) return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal"><div className="spinner" style={{ margin: '60px auto' }} /></div>
    </div>
  );

  const { fairBoosted, fairScore, voterCount } = movie;
  const RANK_BONUS = { 1: 1.0, 2: 0.6, 3: 0.4 };
  const tokenBoost = Math.round(
    Object.values(top3).reduce((acc, rank) => acc + (RANK_BONUS[rank] || 0), 0) * 100
  ) / 100;

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <div className="modal-header-text">
            {editing ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <input className="input" placeholder="Title" value={editTitle} onChange={e => setEditTitle(e.target.value)} />
                <div style={{ display: 'flex', gap: 6 }}>
                  <input className="input" placeholder="Director" value={editDirector} onChange={e => setEditDirector(e.target.value)} />
                  <input className="input" placeholder="Year" value={editYear} onChange={e => setEditYear(e.target.value)} style={{ maxWidth: 80 }} />
                </div>
              </div>
            ) : (
              <>
                <div className="modal-title">{editTitle}</div>
                <div className="modal-sub">{editDirector}{editYear ? ` · ${editYear}` : ''}</div>
              </>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setEditing(e => !e)}>
              {editing ? 'Done' : '✎'}
            </button>
            <button className="modal-close" onClick={onClose}>✕</button>
          </div>
        </div>

        <div className="modal-body">
          {/* Stats */}
          <div className="info-grid">
            <div className="info-cell">
              <div className={`info-val ${scoreClass(fairBoosted)}`}>{fmt(fairBoosted)}</div>
              <div className="info-lbl">Score</div>
            </div>
            <div className="info-cell">
              <div className={`info-val ${voterCountClass(voterCount)}`}>{voterCount}/{GROUP_SIZE}</div>
              <div className="info-lbl">Voters</div>
            </div>
            <div className="info-cell">
              <div className={`info-val ${tokenBoost > 0 ? 'score-mid' : 'score-none'}`}>
                {tokenBoost > 0 ? `+${tokenBoost.toFixed(1)}` : '—'}
              </div>
              <div className="info-lbl">Token Bonus</div>
            </div>
          </div>

          {/* Ratings */}
          <div className="modal-section-label section-label">Ratings</div>
          <div className="ratings-grid">
            {VOTERS.map(v => {
              const val = ratings[v];
              const isOn = val != null;
              return (
                <div key={v} className={`rating-row${isOn ? '' : ' rating-off'}`}>
                  <div className="rating-header">
                    <span className="rating-voter">{v}</span>
                    <div className="rating-controls">
                      {isOn && (
                        <input
                          type="number"
                          className={`rating-number-input ${scoreClass(val)}`}
                          min={0} max={10} step={0.5}
                          value={val}
                          onChange={e => setScore(v, e.target.value)}
                        />
                      )}
                      <button
                        className={`btn btn-sm btn-ghost rating-toggle`}
                        onClick={() => toggleVoter(v)}
                        title={isOn ? 'Remove rating' : 'Add rating'}
                      >{isOn ? '✕' : '+'}</button>
                    </div>
                  </div>

                  {isOn && (
                    <>
                      <div className="score-bar">
                        <div className="score-bar-fill" style={{
                          width: `${(val / 10) * 100}%`,
                          background: val >= 7.5 ? 'var(--green)' : val >= 5 ? 'var(--gold)' : 'var(--red)'
                        }} />
                      </div>
                      <input
                        type="text"
                        className="rating-comment"
                        placeholder="Add a note…"
                        maxLength={300}
                        value={comments[v] || ''}
                        onChange={e => setComments(c => ({ ...c, [v]: e.target.value }))}
                      />
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {/* Top 3 */}
          <div className="modal-section-label section-label" style={{ marginTop: 20 }}>Top 3 Picks</div>
          <div className="top3-grid">
            {VOTERS.map(v => (
              <div key={v} className="top3-voter-row">
                <span className="top3-voter-name">{v}</span>
                <div className="top3-btns">
                  {[1, 2, 3].map(rank => (
                    <button
                      key={rank}
                      className={`top3-btn${top3[v] === rank ? ' active' : ''}`}
                      onClick={() => toggleTop3(v, rank)}
                      title={`${MEDALS[rank]} #${rank}`}
                    >
                      {MEDALS[rank]}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Flags */}
          <div className="modal-section-label section-label" style={{ marginTop: 20 }}>Flags</div>
          <div className="flags-row">
            <button className={`toggle-btn${mn ? ' active' : ''}`} onClick={() => setMn(x => !x)}>
              🎬 Movie Night
            </button>
            <button className={`toggle-btn${watchlist ? ' active' : ''}`} onClick={() => setWatchlist(x => !x)}>
              👁 Watchlist
            </button>
          </div>

          {movie.rank_global && (
            <div style={{ marginTop: 20 }}>
              <div className="section-label">Global Rank</div>
              <div className={rankClass(movie.rank_global)} style={{ fontSize: 28, fontWeight: 700, marginTop: 6 }}>
                #{movie.rank_global}
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-danger btn-sm" style={{ marginRight: 'auto' }} onClick={handleDelete}>
            Delete
          </button>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-gold" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
