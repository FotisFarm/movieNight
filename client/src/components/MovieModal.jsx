import { useState, useEffect } from 'react';
import { api } from '../api';
import { useAppConfig } from '../AppConfigContext';
import { fmtScore10 as fmt, scoreClass, extractImdbId, posterUrl } from '../utils';
import './MovieModal.css';

const MEDALS = { 1: '🥇', 2: '🥈', 3: '🥉' };
const rankBonus = r => (r >= 1 && r <= 10 ? (11 - r) / 10 : 0);
const rankLabel = r => `${MEDALS[r] ? MEDALS[r] + ' ' : ''}#${r}`;

function voterCountClass(n, groupSize) {
  if (n === groupSize) return 'score-high';
  if (n >= 2)          return 'score-orange';
  return 'score-low';
}

const normTitle = s => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const yr = s => String(s || '').slice(0, 4);

// A film's own title/year may legitimately differ from IMDb's (Greek/alternate titles),
// so a mismatch is only ever surfaced as a warning — never blocks saving.
function imdbMismatch(detail, title, year) {
  if (!detail) return null;
  const titleDiffers = normTitle(detail.title) !== normTitle(title);
  const yearDiffers  = yr(detail.year) !== yr(year);
  if (!titleDiffers && !yearDiffers) return null;
  return { titleDiffers, yearDiffers };
}

function rankClass(r) {
  if (!r || r > 100) return 'score-low';
  if (r > 50)        return 'score-orange';
  if (r > 25)        return 'score-mid';
  return 'score-high';
}

export default function MovieModal({ movieId, onClose, onSaved, onDeleted, rankData }) {
  const { voters: configVoters, groupSize } = useAppConfig();
  const currentVoter = sessionStorage.getItem('voter');
  const isAdmin = currentVoter === 'mnAdmin';
  const isGhost = !configVoters.includes(currentVoter) && currentVoter !== 'mnAdmin' && !!currentVoter;
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
  const [editImdbId,   setEditImdbId]   = useState('');
  const [imdbCandidates, setImdbCandidates] = useState(null); // null = not searched
  const [imdbBusy,     setImdbBusy]     = useState(false);
  const [imdbDetail,   setImdbDetail]   = useState(null); // OMDb detail for the current id
  const [imdbOpen,     setImdbOpen]     = useState(false); // IMDb editor shown (via tile click)
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saveError,     setSaveError]     = useState('');
  // Custom lists this film can be dropped into. Membership is written straight
  // through (own endpoints) rather than riding along with Save, so the chips
  // reflect the server the moment they're clicked.
  const [lists,        setLists]        = useState(null);   // null = still loading
  const [listBusyId,   setListBusyId]   = useState(null);
  const [newListTitle, setNewListTitle] = useState('');
  const [newListOpen,  setNewListOpen]  = useState(false);
  const [listError,    setListError]    = useState('');

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
    if (!movieId) return;
    setLists(null);
    setNewListOpen(false);
    setNewListTitle('');
    setListError('');
    api.getLists(movieId).then(setLists).catch(() => setLists([]));
  }, [movieId]);

  useEffect(() => {
    setConfirmDelete(false);
    setSaveError('');
    if (!movieId) return;
    setLoading(true);
    api.getMovie(movieId).then(m => {
      setMovie(m);
      const r = {}, c = {}, t = {};
      configVoters.forEach(v => {
        r[v] = m.ratings?.[v] ?? null;
        c[v] = m.comments?.[v] ?? '';
        t[v] = m.top3?.[v] ?? null;
      });
      if (isGhost) {
        r[currentVoter] = m.ratings?.[currentVoter] ?? null;
        c[currentVoter] = m.comments?.[currentVoter] ?? '';
      }
      setRatings(r);
      setComments(c);
      setTop3(t);
      setMn(m.mn);
      setWatchlist(m.watchlist);
      setEditTitle(m.title || '');
      setEditDirector(m.director || '');
      setEditYear(m.year || '');
      setEditImdbId(m.imdb_id || '');
      setImdbCandidates(null);
      setImdbDetail(null);
      setImdbOpen(false);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [movieId]);

  // Fetch the IMDb entry behind the current id so we can flag title/year mismatches.
  useEffect(() => {
    const id = extractImdbId(editImdbId);
    if ((!editing && !imdbOpen) || !id) { setImdbDetail(null); return; }
    let cancelled = false;
    api.imdbDetail(id)
      .then(d => { if (!cancelled) setImdbDetail(d); })
      .catch(() => { if (!cancelled) setImdbDetail(null); });
    return () => { cancelled = true; };
  }, [editImdbId, editing, imdbOpen]);

  function toggleVoter(voter) {
    setRatings(r => ({ ...r, [voter]: r[voter] == null ? 5 : null }));
  }

  function setScore(voter, val) {
    const n = parseFloat(val);
    if (isNaN(n)) return;
    setRatings(r => ({ ...r, [voter]: Math.min(10, Math.max(0, n)) }));
  }


  // Search OMDb for the current title/year and offer candidates to fix the IMDb id.
  async function searchImdb() {
    setImdbBusy(true);
    try {
      const r = await api.imdbSearch(editTitle.trim(), editYear.trim());
      const list = r.status === 'exact' ? [r.match] : (r.candidates || []);
      setImdbCandidates(list);
    } catch {
      setImdbCandidates([]);
    } finally {
      setImdbBusy(false);
    }
  }

  // Add or remove this film from one list. Lists are collaborative, so anyone
  // logged in may do this on any list.
  async function toggleList(list) {
    setListBusyId(list.id);
    setListError('');
    try {
      if (list.has_film) await api.removeFromList(list.id, movieId);
      else               await api.addToList(list.id, movieId);
      setLists(current => current.map(l => (
        l.id === list.id
          ? { ...l, has_film: !l.has_film, film_count: l.film_count + (l.has_film ? -1 : 1) }
          : l
      )));
    } catch (e) {
      setListError(e.message);
    } finally {
      setListBusyId(null);
    }
  }

  // Create a list and drop this film into it in one go.
  async function createListWithFilm() {
    const title = newListTitle.trim();
    if (!title) return;
    setListBusyId('new');
    setListError('');
    try {
      const created = await api.createList({ title });
      await api.addToList(created.id, movieId);
      setLists(current => [{ ...created, film_count: 1, posters: [], has_film: true }, ...(current || [])]);
      setNewListTitle('');
      setNewListOpen(false);
    } catch (e) {
      setListError(e.message);
    } finally {
      setListBusyId(null);
    }
  }

  async function handleSave() {
    setSaving(true);
    const ratingPayload = {}, commentPayload = {}, top3Payload = {};
    configVoters.forEach(v => {
      ratingPayload[v] = ratings[v];
      if (ratings[v] != null) commentPayload[v] = comments[v];
      top3Payload[v] = top3[v] ?? null;
    });
    if (isGhost) {
      ratingPayload[currentVoter] = ratings[currentVoter] ?? null;
      if (ratings[currentVoter] != null) commentPayload[currentVoter] = comments[currentVoter] ?? '';
    }

    const payload = {
      title: editTitle.trim(),
      director: editDirector.trim(),
      year: editYear.trim(),
      mn,
      watchlist,
      ratings: ratingPayload,
      comments: commentPayload,
      top3: top3Payload,
    };
    // Only send imdb_id when it actually changed — avoids a needless OMDb re-fetch on every save.
    // Compare the extracted id so pasting a URL for the same film is not treated as a change.
    const cleanId = extractImdbId(editImdbId);
    if (cleanId !== (movie.imdb_id || '')) payload.imdb_id = cleanId;

    try {
      const updated = await api.updateMovie(movieId, payload);
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
      <div className="modal movie-modal-split">
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

        <div className="modal-body movie-modal-body-split">
          {/* ── Left Column: Poster, Scores, Flags, Lists ── */}
          <div className="movie-modal-left">
            <div className="movie-modal-poster-wrap">
              {movie.poster_path ? (
                <img
                  className="movie-modal-poster"
                  src={posterUrl(movie.poster_path, 'w342')}
                  alt={movie.title || ''}
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <div className="movie-modal-poster-placeholder">
                  <span>🎞</span>
                </div>
              )}
            </div>

            {/* Stats */}
            <div className="info-grid">
              <div className="info-cell">
                <div className={`info-val ${scoreClass(fairBoosted)}`}>{fmt(fairBoosted)}</div>
                <div className="info-lbl">Score</div>
              </div>
              <div className="info-cell">
                <div className={`info-val ${voterCountClass(voterCount, groupSize)}`}>{voterCount}/{groupSize}</div>
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
              {/* Clicking the tile opens the IMDb id editor below. */}
              <div
                className="info-cell"
                role="button" tabIndex={0}
                style={{ cursor: 'pointer' }}
                title={movie.imdb_id ? 'Click the badge to open IMDb · click here to edit the link' : 'Add IMDb link'}
                onClick={() => setImdbOpen(o => !o)}
                onKeyDown={e => e.key === 'Enter' && setImdbOpen(o => !o)}
              >
                <div className="info-val">
                  {movie.imdb_rating != null ? (
                    movie.imdb_id ? (
                      <a
                        href={`https://www.imdb.com/title/${movie.imdb_id}/`}
                        className="badge-imdb-pill"
                        target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: 14 }}
                        title="Open on IMDb"
                        onClick={e => e.stopPropagation()}
                      >
                        <span className="imdb-logo" style={{ fontSize: 11 }}>IMDb</span>
                        <span className="imdb-rating" style={{ fontSize: 14 }}>{Number.isInteger(movie.imdb_rating) ? movie.imdb_rating : movie.imdb_rating.toFixed(1)}</span>
                      </a>
                    ) : (
                      <span className="badge-imdb-pill" style={{ fontSize: 14 }}>
                        <span className="imdb-logo" style={{ fontSize: 11 }}>IMDb</span>
                        <span className="imdb-rating" style={{ fontSize: 14 }}>{Number.isInteger(movie.imdb_rating) ? movie.imdb_rating : movie.imdb_rating.toFixed(1)}</span>
                      </span>
                    )
                  ) : (
                    <span className="score-none">＋</span>
                  )}
                </div>
                <div className="info-lbl">IMDb</div>
              </div>
            </div>

            {/* IMDb editor — opened by ✎ edit mode or by clicking the IMDb tile above */}
            {(editing || imdbOpen) && (
              <>
                <div className="modal-section-label section-label" style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>IMDb Link</span>
                  {extractImdbId(editImdbId) && (
                    <a
                      href={`https://www.imdb.com/title/${extractImdbId(editImdbId)}/`}
                      target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 11, fontWeight: 400, textTransform: 'none' }}
                    >
                      View on IMDb ↗
                    </a>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    className="input"
                    placeholder="Paste IMDb link or ID (tt6751668)"
                    value={editImdbId}
                    onChange={e => setEditImdbId(e.target.value)}
                    onBlur={e => { const id = extractImdbId(e.target.value); if (id) setEditImdbId(id); }}
                    style={{ flex: 1 }}
                  />
                  <button className="btn btn-ghost btn-sm" onClick={searchImdb} disabled={imdbBusy || !editTitle.trim()}>
                    {imdbBusy ? '…' : 'Search'}
                  </button>
                  {editImdbId.trim() && (
                    <button className="btn btn-ghost btn-sm" onClick={() => { setEditImdbId(''); setImdbCandidates(null); }} title="Clear IMDb id">✕</button>
                  )}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
                  Paste a full imdb.com link or ID.
                </div>

                {(() => {
                  const mm = imdbMismatch(imdbDetail, editTitle, editYear);
                  if (!mm) return null;
                  return (
                    <div style={{ marginTop: 8, padding: '8px 10px', border: '1px solid var(--gold)', borderRadius: 'var(--radius)', background: 'rgba(255,193,7,.08)' }}>
                      <div style={{ fontSize: 12, color: 'var(--text)' }}>
                        ⚠ IMDb says <strong>{imdbDetail.title}{imdbDetail.year ? ` (${yr(imdbDetail.year)})` : ''}</strong>
                        {' '}— your entry is <strong>{editTitle}{editYear ? ` (${yr(editYear)})` : ''}</strong>.
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
                        Fine if you use an alternate title — otherwise this id may be the wrong film.
                      </div>
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ marginTop: 8 }}
                        onClick={() => {
                          setEditTitle(imdbDetail.title);
                          if (imdbDetail.year) setEditYear(yr(imdbDetail.year));
                          if (imdbDetail.director) setEditDirector(imdbDetail.director);
                        }}
                      >
                        Use IMDb's values
                      </button>
                    </div>
                  );
                })()}

                {imdbCandidates !== null && (
                  imdbCandidates.length ? (
                    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', marginTop: 8, overflow: 'hidden' }}>
                      {imdbCandidates.map(c => (
                        <div
                          key={c.imdbId}
                          role="button" tabIndex={0}
                          onClick={() => { setEditImdbId(c.imdbId); setImdbCandidates(null); }}
                          onKeyDown={e => e.key === 'Enter' && (setEditImdbId(c.imdbId), setImdbCandidates(null))}
                          style={{ display: 'flex', gap: 10, padding: '8px 12px', cursor: 'pointer', alignItems: 'center', borderBottom: '1px solid var(--border)' }}
                        >
                          {c.poster && <img src={c.poster} alt="" style={{ width: 32, height: 48, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />}
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>{c.title}</div>
                            <div style={{ fontSize: 11, color: 'var(--text2)' }}>{c.year} · {c.imdbId}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 8 }}>No IMDb matches found.</div>
                  )
                )}
              </>
            )}

            {/* Flags */}
            <div className="modal-section-label section-label" style={{ marginTop: 6 }}>Flags</div>
            <div className="flags-row">
              <button className={`toggle-btn${mn ? ' active' : ''}`} onClick={() => setMn(x => !x)}>
                🎬 Movie Night
              </button>
              <button className={`toggle-btn${watchlist ? ' active' : ''}`} onClick={() => setWatchlist(x => !x)}>
                👁 Watchlist
              </button>
            </div>

            {/* Lists */}
            <div className="modal-section-label section-label" style={{ marginTop: 6 }}>Lists</div>
            {lists === null ? (
              <div style={{ fontSize: 12, color: 'var(--text2)' }}>Loading lists…</div>
            ) : (
              <>
                <div className="flags-row">
                  {lists.map(l => (
                    <button
                      key={l.id}
                      className={`toggle-btn${l.has_film ? ' active' : ''}`}
                      disabled={listBusyId === l.id}
                      title={l.has_film ? `Remove from “${l.title}”` : `Add to “${l.title}”`}
                      onClick={() => toggleList(l)}
                    >
                      {l.has_film ? '✓ ' : '+ '}{l.title}
                    </button>
                  ))}
                  {!newListOpen && (
                    <button className="toggle-btn" onClick={() => setNewListOpen(true)}>+ New list</button>
                  )}
                </div>

                {newListOpen && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <input
                      className="input"
                      autoFocus
                      maxLength={80}
                      placeholder="New list title"
                      value={newListTitle}
                      onChange={e => setNewListTitle(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && createListWithFilm()}
                      style={{ flex: 1 }}
                    />
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={createListWithFilm}
                      disabled={listBusyId === 'new' || !newListTitle.trim()}
                    >
                      Create &amp; add
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => { setNewListOpen(false); setNewListTitle(''); }}>✕</button>
                  </div>
                )}

                {lists.length === 0 && !newListOpen && (
                  <div style={{ fontSize: 12, color: 'var(--text2)' }}>No lists yet.</div>
                )}
                {listError && (
                  <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 6 }}>{listError}</div>
                )}
              </>
            )}
          </div>

          {/* ── Right Column: Voter Ratings & Picks ── */}
          <div className="movie-modal-right">
            <div className="movie-modal-right-header">
              <div className="modal-section-label section-label" style={{ marginBottom: 0 }}>Voter Ratings &amp; Picks</div>
              <span style={{ fontSize: 12, color: 'var(--text2)', fontWeight: 600 }}>
                {voterCount} of {groupSize} rated
              </span>
            </div>

            <div className="voter-card-list">
              {configVoters.map(v => {
                const val = ratings[v];
                const isOn = val != null;
                const canEdit = isAdmin || v === currentVoter;
                const currentRank = top3[v] ?? null;
                const nextSlot = (top10Counts[v] ?? 0) + 1;
                const opts = currentRank != null ? [currentRank] : (nextSlot <= 10 ? [nextSlot] : []);
                const isSelf = v === currentVoter;

                return (
                  <div
                    key={v}
                    className={`voter-rating-card${isOn ? '' : ' rating-off'}${!canEdit ? ' rating-locked' : ''}${isSelf ? ' voter-card-self' : ''}`}
                  >
                    <div className="voter-card-header">
                      <div className="voter-card-user">
                        <div className="voter-avatar-circle">{v.slice(0, 2)}</div>
                        <span className="voter-name-label">
                          {v}{isSelf ? ' (You)' : ''}
                        </span>
                      </div>

                      <div className="voter-card-controls">
                        {isOn && (
                          <select
                            className="select select-sm voter-top10-select"
                            value={currentRank ?? ''}
                            disabled={!canEdit}
                            title={canEdit ? "Assign to your Top 10" : "Top 10 Rank"}
                            onChange={e => setTop3(t => ({ ...t, [v]: e.target.value ? parseInt(e.target.value) : null }))}
                          >
                            <option value="">Top 10: —</option>
                            {opts.map(rank => (
                              <option key={rank} value={rank}>{rankLabel(rank)}</option>
                            ))}
                          </select>
                        )}

                        {isOn && (
                          <input
                            type="number"
                            key={`${movieId}-${v}-${isOn}`}
                            className={`rating-number-input ${scoreClass(val)}`}
                            min={0} max={10} step={0.5}
                            defaultValue={val}
                            onChange={e => canEdit && setScore(v, e.target.value)}
                            readOnly={!canEdit}
                          />
                        )}

                        {canEdit && (
                          <button
                            className="btn btn-sm btn-ghost rating-toggle"
                            onClick={() => toggleVoter(v)}
                            title={isOn ? 'Remove rating' : 'Add rating'}
                          >
                            {isOn ? '✕' : '+'}
                          </button>
                        )}
                      </div>
                    </div>

                    {isOn && (
                      <>
                        <div className="score-bar">
                          <div
                            className="score-bar-fill"
                            style={{
                              width: `${(val / 10) * 100}%`,
                              background: val >= 7.5 ? 'var(--green)' : val >= 5 ? 'var(--gold)' : 'var(--red)'
                            }}
                          />
                        </div>
                        <input
                          type="text"
                          className="rating-comment"
                          placeholder={canEdit ? 'Add a note or review…' : ''}
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

              {isGhost && (() => {
                const v = currentVoter;
                const val = ratings[v];
                const isOn = val != null;
                return (
                  <div className={`voter-rating-card${isOn ? '' : ' rating-off'} voter-card-self`}>
                    <div className="voter-card-header">
                      <div className="voter-card-user">
                        <div className="voter-avatar-circle">{v.slice(0, 2)}</div>
                        <span className="voter-name-label">{v} (Guest)</span>
                      </div>

                      <div className="voter-card-controls">
                        {isOn && (
                          <input
                            type="number"
                            key={`${movieId}-${v}-${isOn}`}
                            className={`rating-number-input ${scoreClass(val)}`}
                            min={0} max={10} step={0.5}
                            defaultValue={val}
                            onChange={e => setScore(v, e.target.value)}
                          />
                        )}
                        <button
                          className="btn btn-sm btn-ghost rating-toggle"
                          onClick={() => toggleVoter(v)}
                          title={isOn ? 'Remove rating' : 'Add rating'}
                        >
                          {isOn ? '✕' : '+'}
                        </button>
                      </div>
                    </div>

                    {isOn && (
                      <>
                        <div className="score-bar">
                          <div
                            className="score-bar-fill"
                            style={{
                              width: `${(val / 10) * 100}%`,
                              background: val >= 7.5 ? 'var(--green)' : val >= 5 ? 'var(--gold)' : 'var(--red)'
                            }}
                          />
                        </div>
                        <input
                          type="text"
                          className="rating-comment"
                          placeholder="Add a note or review…"
                          maxLength={300}
                          value={comments[v] || ''}
                          onChange={e => setComments(c => ({ ...c, [v]: e.target.value }))}
                        />
                      </>
                    )}
                  </div>
                );
              })()}
            </div>
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
