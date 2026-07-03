import { useState, useEffect } from 'react';
import { api } from '../api';
import { VOTERS, GROUP_SIZE } from '../constants';
import { fmtScore10 as fmt, scoreClass } from '../utils';
import './MovieModal.css';

const MEDALS = { 1: '🥇', 2: '🥈', 3: '🥉' };
const rankBonus = r => (r >= 1 && r <= 10 ? (11 - r) / 10 : 0);
const rankLabel = r => `${MEDALS[r] ? MEDALS[r] + ' ' : ''}#${r}`;

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

export default function MovieModal({ movieId, onClose, onSaved, onDeleted, rankData }) {
  const currentVoter = sessionStorage.getItem('voter');
  const isAdmin = currentVoter === 'mnAdmin';
  const [movie, setMovie]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);

  const [ratings,  setRatings]  = useState({});  // voter -> number | null
  const [comments, setComments] = useState({});  // voter -> string
  const [top3,     setTop3]     = useState({});  // voter -> rank | null
  const [top10Counts, setTop10Counts] = useState({});  // voter -> total picks
  const [mn,       setMn]       = useState(false);
  const [watchlist, setWatchlist] = useState(false);
  const [editing,      setEditing]      = useState(false);
  const [editTitle,    setEditTitle]    = useState('');
  const [editDirector, setEditDirector] = useState('');
  const [editYear,     setEditYear]     = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saveError,     setSaveError]     = useState('');

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    api.getTop10Counts().then(setTop10Counts).catch(() => {});
  }, [movieId]);

  useEffect(() => {
    setConfirmDelete(false);
    setSaveError('');
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
      setSaveError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
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
  const tokenBoost = Math.round(
    Object.values(top3).reduce((acc, rank) => acc + rankBonus(rank), 0) * 100
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
            {rankData?.fair != null && (
              <div className="info-cell">
                <div className={`info-val ${rankClass(rankData.fair)}`}>#{rankData.fair}</div>
                <div className="info-lbl">Fair Rank</div>
              </div>
            )}
            {rankData?.group != null && (
              <div className="info-cell">
                <div className={`info-val ${rankClass(rankData.group)}`}>#{rankData.group}</div>
                <div className="info-lbl">Group Rank</div>
              </div>
            )}
            {movie.imdb_rating != null && (
              <div className="info-cell">
                <div className="info-val">
                  {movie.imdb_id ? (
                    <a href={`https://www.imdb.com/title/${movie.imdb_id}/`} className="badge-imdb-pill" target="_blank" rel="noopener noreferrer" style={{ fontSize: 14 }}>
                      <span className="imdb-logo" style={{ fontSize: 11 }}>IMDb</span>
                      <span className="imdb-rating" style={{ fontSize: 14 }}>{Number.isInteger(movie.imdb_rating) ? movie.imdb_rating : movie.imdb_rating.toFixed(1)}</span>
                    </a>
                  ) : (
                    <span className="badge-imdb-pill" style={{ fontSize: 14 }}>
                      <span className="imdb-logo" style={{ fontSize: 11 }}>IMDb</span>
                      <span className="imdb-rating" style={{ fontSize: 14 }}>{Number.isInteger(movie.imdb_rating) ? movie.imdb_rating : movie.imdb_rating.toFixed(1)}</span>
                    </span>
                  )}
                </div>
                <div className="info-lbl">IMDb</div>
              </div>
            )}
          </div>

          {/* Ratings */}
          <div className="modal-section-label section-label">Ratings</div>
          <div className="ratings-grid">
            {VOTERS.map(v => {
              const val = ratings[v];
              const isOn = val != null;
              const canEdit = isAdmin || v === currentVoter;
              return (
                <div key={v} className={`rating-row${isOn ? '' : ' rating-off'}${!canEdit ? ' rating-locked' : ''}`}>
                  <div className="rating-header">
                    <span className="rating-voter">{v}</span>
                    <div className="rating-controls">
                      {isOn && (
                        <input
                          type="number"
                          key={`${v}-${val ?? 'null'}`}
                          className={`rating-number-input ${scoreClass(val)}`}
                          min={0} max={10} step={0.5}
                          defaultValue={val}
                          onBlur={e => canEdit && setScore(v, e.target.value)}
                          readOnly={!canEdit}
                        />
                      )}
                      {canEdit && (
                        <button
                          className={`btn btn-sm btn-ghost rating-toggle`}
                          onClick={() => toggleVoter(v)}
                          title={isOn ? 'Remove rating' : 'Add rating'}
                        >{isOn ? '✕' : '+'}</button>
                      )}
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
                        placeholder={canEdit ? 'Add a note…' : ''}
                        maxLength={300}
                        value={comments[v] || ''}
                        onChange={e => canEdit && setComments(c => ({ ...c, [v]: e.target.value }))}
                        readOnly={!canEdit}
                      />
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {/* Top 10 */}
          <div className="modal-section-label section-label" style={{ marginTop: 20 }}>Top 10 Picks</div>
          <div className="top3-grid">
            {VOTERS.map(v => {
              const canEdit = isAdmin || v === currentVoter;
              const current = top3[v] ?? null;
              // Append/remove only — reordering happens via drag-and-drop on the Stats page.
              // If this film is already a pick, the only option besides "remove" is its current rank.
              // Otherwise it can only be added to the next free slot (count + 1).
              const nextSlot = (top10Counts[v] ?? 0) + 1;
              const opts = current != null ? [current] : (nextSlot <= 10 ? [nextSlot] : []);
              return (
                <div key={v} className={`top3-voter-row${!canEdit ? ' rating-locked' : ''}`}>
                  <span className="top3-voter-name">{v}</span>
                  <select
                    className="select select-sm top3-select"
                    value={current ?? ''}
                    disabled={!canEdit}
                    onChange={e => setTop3(t => ({ ...t, [v]: e.target.value ? parseInt(e.target.value) : null }))}
                  >
                    <option value="">—</option>
                    {opts.map(rank => (
                      <option key={rank} value={rank}>{rankLabel(rank)}</option>
                    ))}
                  </select>
                </div>
              );
            })}
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

        </div>

        <div className="modal-footer">
          {confirmDelete ? (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginRight: 'auto' }}>
              <span style={{ fontSize: 12, color: 'var(--red)' }}>Delete "{movie?.title}"?</span>
              <button className="btn btn-danger btn-sm" onClick={handleDelete}>Yes, delete</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(false)}>Cancel</button>
            </div>
          ) : (
            <button className="btn btn-danger btn-sm" style={{ marginRight: 'auto' }} onClick={handleDelete}>
              Delete
            </button>
          )}
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          {saveError && (
            <span style={{ fontSize: 12, color: 'var(--red)', marginRight: 8 }}>{saveError}</span>
          )}
          <button className="btn btn-gold" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
