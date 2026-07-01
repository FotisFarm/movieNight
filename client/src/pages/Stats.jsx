import { useState, useEffect, useMemo } from 'react';
import {
  DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { api } from '../api';
import MovieModal from '../components/MovieModal';
import DirectorYearModal from '../components/DirectorYearModal';
import RankIcon from '../components/RankIcon';
import { useToast } from '../hooks/useToast.jsx';
import './Stats.css';

const VOTERS = ['Μητσέας', 'Παντελής', 'Στέλιας', 'Φώτης', 'Λεόντιος'];

function scoreClass(v) {
  if (v == null) return 'score-none';
  if (v >= 7.5) return 'score-high';
  if (v >= 5)   return 'score-mid';
  return 'score-low';
}

function fmt(v, d = 2) {
  if (v == null) return '–';
  return v.toFixed(d).replace('.', ',');
}

// Compute per-voter stats from all movies
function computeStats(movies) {
  return VOTERS.map(voter => {
    const myFilms = movies.filter(m => m.ratings?.[voter] != null);
    const scores  = myFilms.map(m => m.ratings[voter]);
    const mean    = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;

    // top picks (rank 1–10), sorted by rank
    const topPicks = movies
      .filter(m => m.top3?.[voter] != null)
      .sort((a, b) => a.top3[voter] - b.top3[voter]);
    const top3Count = topPicks.length;

    // fav director (min 2 rated, highest mean score by this voter)
    const dirMap = {};
    for (const m of myFilms) {
      if (!m.director) continue;
      if (!dirMap[m.director]) dirMap[m.director] = [];
      dirMap[m.director].push(m.ratings[voter]);
    }
    const dirBreakdown = Object.entries(dirMap)
      .map(([name, scores]) => ({ name, count: scores.length, mean: avg(scores) }))
      .sort((a, b) => b.mean - a.mean || b.count - a.count);
    const favDirector = dirBreakdown.find(d => d.count >= 2)?.name ?? null;

    // fav decade (min 2 rated, highest mean)
    const decMap = {};
    for (const m of myFilms) {
      const yr = parseInt(m.year);
      if (!yr) continue;
      const dec = Math.floor(yr / 10) * 10;
      if (!decMap[dec]) decMap[dec] = [];
      decMap[dec].push(m.ratings[voter]);
    }
    const decBreakdown = Object.entries(decMap)
      .map(([dec, scores]) => ({ dec: parseInt(dec), count: scores.length, mean: avg(scores) }))
      .sort((a, b) => b.mean - a.mean || b.count - a.count);
    const favDecade = decBreakdown.find(d => d.count >= 2)?.dec ?? null;

    // score distribution — bucket by whole number (floor)
    const dist = {};
    for (const s of scores) {
      const bucket = Math.floor(s);
      dist[bucket] = (dist[bucket] || 0) + 1;
    }

    // top & bottom films by this voter's own score
    const ranked = [...myFilms].sort((a, b) => b.ratings[voter] - a.ratings[voter]);
    const topFilms = ranked.slice(0, 10);
    const bottomFilms = ranked.slice(-10).reverse();

    return { voter, ratedCount: myFilms.length, mean, top3Count, topPicks, favDirector, favDecade, dist, dirBreakdown, decBreakdown, topFilms, bottomFilms };
  });
}

function avg(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length; }

function computeGlobalStats(movies) {
  const scored = movies.filter(m => (m.voterCount ?? 0) >= 2 && m.fairBoosted != null);
  const mn     = movies.filter(m => m.mn);

  const meanScore = scored.length ? avg(scored.map(m => m.fairBoosted)) : null;

  const fairRanked = [...scored].sort((a, b) => {
    if (b.fairBoosted !== a.fairBoosted) return b.fairBoosted - a.fairBoosted;
    if (b.voterCount  !== a.voterCount)  return b.voterCount  - a.voterCount;
    return (parseInt(a.year) || 9999) - (parseInt(b.year) || 9999);
  });
  const bestFilm   = fairRanked[0] ?? null;
  const worstFilm  = fairRanked[fairRanked.length - 1] ?? null;
  const mostContro = scored
    .filter(m => m.stdDev != null)
    .reduce((c, m) => (!c || m.stdDev > c.stdDev) ? m : c, null);

  const dirMap = {};
  for (const m of scored) {
    if (!m.director) continue;
    if (!dirMap[m.director]) dirMap[m.director] = [];
    dirMap[m.director].push(m.fairBoosted);
  }
  const bestDirector = Object.entries(dirMap)
    .filter(([, s]) => s.length >= 2)
    .map(([name, s]) => ({ name, count: s.length, mean: avg(s) }))
    .sort((a, b) => b.mean - a.mean)[0] ?? null;

  const decMap = {};
  for (const m of scored) {
    const yr = parseInt(m.year);
    if (!yr) continue;
    const dec = Math.floor(yr / 10) * 10;
    if (!decMap[dec]) decMap[dec] = [];
    decMap[dec].push(m.fairBoosted);
  }
  const bestDecade = Object.entries(decMap)
    .filter(([, s]) => s.length >= 2)
    .map(([dec, s]) => ({ dec: parseInt(dec), count: s.length, mean: avg(s) }))
    .sort((a, b) => b.mean - a.mean)[0] ?? null;

  return {
    total: movies.length,
    rated: movies.filter(m => (m.voterCount ?? 0) >= 1).length,
    scored: scored.length,
    allFive: movies.filter(m => m.voterCount === 5).length,
    mn: mn.length,
    meanScore,
    bestFilm,
    worstFilm,
    mostContro,
    bestDirector,
    bestDecade,
  };
}

function Top10StaticRow({ m, voter, onOpen }) {
  return (
    <div className="top10-row" onClick={() => onOpen(m.id)}>
      <span className="top10-rank"><RankIcon rank={m.top3[voter]} /></span>
      <span className="top10-title">{m.title}</span>
      <span className="top10-year">{m.year || ''}</span>
    </div>
  );
}

function Top10SortableRow({ m, voter, onOpen }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: m.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  return (
    <div ref={setNodeRef} style={style} className="top10-row" onClick={() => !isDragging && onOpen(m.id)}>
      <span className="top10-handle" {...attributes} {...listeners} onClick={e => e.stopPropagation()}>⠿</span>
      <span className="top10-rank"><RankIcon rank={m.top3[voter]} /></span>
      <span className="top10-title">{m.title}</span>
      <span className="top10-year">{m.year || ''}</span>
    </div>
  );
}

export default function Stats({ voter }) {
  const [movies, setMovies]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalId, setModalId] = useState(null);
  const [selectedVoter, setSelectedVoter] = useState(null);
  const [dyTarget, setDyTarget] = useState(null); // { type, value } for director/decade modal
  const { toast, Toast }      = useToast();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 150, tolerance: 5 } }),
  );

  useEffect(() => {
    api.getMovies({}).then(setMovies).finally(() => setLoading(false));
  }, []);

  // Reorder a voter's Top 10 (optimistic), then persist ranks 1..N
  function handleTop10DragEnd(cardVoter, picks, { active, over }) {
    if (!over || active.id === over.id) return;
    const ids = picks.map(p => p.id);
    const from = ids.indexOf(active.id), to = ids.indexOf(over.id);
    if (from === -1 || to === -1) return;
    const newOrder = arrayMove(ids, from, to);
    setMovies(ms => ms.map(m => {
      const idx = newOrder.indexOf(m.id);
      return idx === -1 ? m : { ...m, top3: { ...m.top3, [cardVoter]: idx + 1 } };
    }));
    api.reorderTop10(newOrder, cardVoter).catch(() => toast('Could not save order'));
  }

  function handleSaved(updated) {
    setMovies(ms => ms.map(m => m.id === updated.id ? { ...m, ...updated } : m));
    toast('Saved!');
  }

  const stats       = useMemo(() => computeStats(movies),       [movies]);
  const globalStats = useMemo(() => computeGlobalStats(movies), [movies]);

  if (loading) return <div className="spinner" style={{ margin: '60px auto' }} />;

  const { total, rated, scored, allFive, mn, meanScore, bestFilm, worstFilm, mostContro, bestDirector, bestDecade } = globalStats;

  return (
    <div className="stats-page">
      <Toast />

      {/* ── Global Stats ── */}
      <section className="stats-section">
        <h2 className="stats-heading">Group Overview</h2>
        <div className="global-nums">
          <div className="global-num">
            <span className="global-val">{total}</span>
            <span className="global-lbl">Total films</span>
          </div>
          <div className="global-num">
            <span className="global-val">{rated}</span>
            <span className="global-lbl">Rated</span>
          </div>
          <div className="global-num">
            <span className="global-val">{scored}</span>
            <span className="global-lbl">Scored (≥2 voters)</span>
          </div>
          <div className="global-num">
            <span className="global-val">{allFive}</span>
            <span className="global-lbl">Seen by all 5</span>
          </div>
          <div className="global-num">
            <span className="global-val">{mn}</span>
            <span className="global-lbl">Movie Nights</span>
          </div>
          <div className="global-num">
            <span className={`global-val ${scoreClass(meanScore)}`}>{fmt(meanScore)}</span>
            <span className="global-lbl">Mean fair score</span>
          </div>
        </div>

        <div className="global-highlights">
          {bestFilm && (
            <div className="global-highlight" onClick={() => setModalId(bestFilm.id)}>
              <div className="global-hl-label">Highest rated</div>
              <div className="global-hl-title">{bestFilm.title}</div>
              <div className="global-hl-meta">{bestFilm.director} · {bestFilm.year}</div>
              <div className={`global-hl-score ${scoreClass(bestFilm.fairBoosted)}`}>{fmt(bestFilm.fairBoosted)}</div>
              {bestFilm.boost > 0 && (
                <div className="global-hl-boost">
                  <span className="global-hl-base">{fmt(bestFilm.fairScore)} base</span>
                  <span className="global-hl-plus">+{bestFilm.boost.toFixed(1)} top 10</span>
                </div>
              )}
              {bestFilm.top3 && Object.entries(bestFilm.top3).filter(([, r]) => r != null).length > 0 && (
                <div className="global-hl-picks">
                  {VOTERS.filter(v => bestFilm.top3?.[v] != null).map(v => (
                    <span key={v} className="global-hl-pick">
                      <RankIcon rank={bestFilm.top3[v]} />
                      <span>{v.slice(0, 3)}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
          {worstFilm && (
            <div className="global-highlight" onClick={() => setModalId(worstFilm.id)}>
              <div className="global-hl-label">Lowest rated</div>
              <div className="global-hl-title">{worstFilm.title}</div>
              <div className="global-hl-meta">{worstFilm.director} · {worstFilm.year}</div>
              <div className={`global-hl-score ${scoreClass(worstFilm.fairBoosted)}`}>{fmt(worstFilm.fairBoosted)}</div>
            </div>
          )}
          {mostContro && (
            <div className="global-highlight" onClick={() => setModalId(mostContro.id)}>
              <div className="global-hl-label">Most controversial</div>
              <div className="global-hl-title">{mostContro.title}</div>
              <div className="global-hl-meta">{mostContro.director} · {mostContro.year}</div>
              <div className="global-hl-score score-mid">σ {mostContro.stdDev?.toFixed(2)}</div>
            </div>
          )}
          {bestDirector && (
            <div className="global-highlight" onClick={() => setDyTarget({ type: 'director', value: bestDirector.name })}>
              <div className="global-hl-label">Top director</div>
              <div className="global-hl-title">{bestDirector.name}</div>
              <div className="global-hl-meta">{bestDirector.count} films rated</div>
              <div className={`global-hl-score ${scoreClass(bestDirector.mean)}`}>{fmt(bestDirector.mean)}</div>
            </div>
          )}
          {bestDecade && (
            <div className="global-highlight" onClick={() => setDyTarget({ type: 'decade', value: String(bestDecade.dec) })}>
              <div className="global-hl-label">Top decade</div>
              <div className="global-hl-title">{bestDecade.dec}s</div>
              <div className="global-hl-meta">{bestDecade.count} films rated</div>
              <div className={`global-hl-score ${scoreClass(bestDecade.mean)}`}>{fmt(bestDecade.mean)}</div>
            </div>
          )}
        </div>
      </section>

      {/* ── Voter Overview ── */}
      <section className="stats-section">
        <h2 className="stats-heading">Voter Overview</h2>
        <div className="stats-voter-cards">
          {stats.map(s => (
            <div
              key={s.voter}
              className={`stats-voter-card${selectedVoter === s.voter ? ' active' : ''}`}
              onClick={() => setSelectedVoter(v => v === s.voter ? null : s.voter)}
            >
              <div className="stats-voter-name">{s.voter}</div>

              <div className="stats-kv-grid">
                <div className="stats-kv">
                  <span className="stats-val">{s.ratedCount}</span>
                  <span className="stats-lbl">films rated</span>
                </div>
                <div className="stats-kv">
                  <span className={`stats-val ${scoreClass(s.mean)}`}>{fmt(s.mean)}</span>
                  <span className="stats-lbl">mean score</span>
                </div>
                <div className="stats-kv">
                  <span className="stats-val">{s.top3Count}</span>
                  <span className="stats-lbl">top 10 picks</span>
                </div>
              </div>

              {s.favDirector && (
                <div className="stats-fav">
                  <span className="stats-fav-lbl">Fav director</span>
                  <span className="stats-fav-val">{s.favDirector}</span>
                </div>
              )}
              {s.favDecade && (
                <div className="stats-fav">
                  <span className="stats-fav-lbl">Fav decade</span>
                  <span className="stats-fav-val">{s.favDecade}s</span>
                </div>
              )}

              {/* Score distribution */}
              <div className="stats-dist">
                <div className="stats-dist-label">Score distribution</div>
                <div className="stats-dist-bars">
                  {[1,2,3,4,5,6,7,8,9,10].map(n => {
                    const count = s.dist[n] || 0;
                    const maxCount = Math.max(...Object.values(s.dist), 1);
                    return (
                      <div key={n} className="stats-dist-col">
                        <div className="stats-dist-bar-wrap">
                          <div
                            className={`stats-dist-bar ${n >= 8 ? 'score-high' : n >= 5 ? 'score-mid' : 'score-low'}`}
                            style={{ height: `${Math.round((count / maxCount) * 100)}%` }}
                          />
                        </div>
                        <span className="stats-dist-tick">{n}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          ))}
        </div>

      </section>

      {/* ── All Voters' Top 10 ── */}
      <section className="stats-section">
        <h2 className="stats-heading">Everyone's Top 10</h2>
        <div className="top10-grid">
          {stats.map(s => {
            const editable = (voter === 'mnAdmin' || s.voter === voter) && s.topPicks.length > 1;
            return (
              <div key={s.voter} className={`top10-card${editable ? ' top10-card-editable' : ''}`}>
                <div className="top10-name">
                  {s.voter}
                  {editable && <span className="top10-hint">drag to reorder</span>}
                </div>
                {s.topPicks.length === 0 ? (
                  <div className="top10-empty">No picks yet</div>
                ) : editable ? (
                  <DndContext sensors={sensors} collisionDetection={closestCenter}
                    onDragEnd={e => handleTop10DragEnd(s.voter, s.topPicks, e)}>
                    <SortableContext items={s.topPicks.map(m => m.id)} strategy={verticalListSortingStrategy}>
                      {s.topPicks.map(m => (
                        <Top10SortableRow key={m.id} m={m} voter={s.voter} onOpen={setModalId} />
                      ))}
                    </SortableContext>
                  </DndContext>
                ) : (
                  s.topPicks.map(m => (
                    <Top10StaticRow key={m.id} m={m} voter={s.voter} onOpen={setModalId} />
                  ))
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Voter breakdown modal ── */}
      {selectedVoter && (() => {
        const sel = stats.find(s => s.voter === selectedVoter);
        if (!sel) return null;
        const filmRow = m => (
          <div key={m.id} className="vd-film-row" onClick={() => setModalId(m.id)}>
            <span className="vd-film-title">{m.title}</span>
            <span className="vd-film-meta">{m.year || ''}</span>
            <span className={`vd-film-score ${scoreClass(m.ratings[selectedVoter])}`}>
              {Number.isInteger(m.ratings[selectedVoter]) ? m.ratings[selectedVoter] : m.ratings[selectedVoter].toFixed(1)}
            </span>
          </div>
        );
        return (
          <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setSelectedVoter(null)}>
            <div className="modal vd-modal">
              <div className="modal-header">
                <div className="modal-header-text">
                  <div className="modal-title">{selectedVoter}</div>
                  <div className="modal-sub">{sel.ratedCount} films rated · mean {fmt(sel.mean)}</div>
                </div>
                <button className="modal-close" onClick={() => setSelectedVoter(null)}>✕</button>
              </div>
              <div className="vd-body">
                <div className="vd-grid">
                  <div className="vd-col">
                    <div className="vd-col-title">Top rated</div>
                    {sel.topFilms.map(filmRow)}
                  </div>
                  <div className="vd-col">
                    <div className="vd-col-title">Lowest rated</div>
                    {sel.bottomFilms.map(filmRow)}
                  </div>
                  <div className="vd-col">
                    <div className="vd-col-title">Directors ({sel.dirBreakdown.length})</div>
                    {sel.dirBreakdown.map(d => (
                      <div key={d.name} className="vd-bd-row vd-clickable" onClick={() => setDyTarget({ type: 'director', value: d.name })}>
                        <span className="vd-bd-name">{d.name}</span>
                        <span className="vd-bd-count">{d.count}</span>
                        <span className={`vd-bd-mean ${scoreClass(d.mean)}`}>{fmt(d.mean, 1)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="vd-col">
                    <div className="vd-col-title">Decades</div>
                    {sel.decBreakdown.map(d => (
                      <div key={d.dec} className="vd-bd-row vd-clickable" onClick={() => setDyTarget({ type: 'decade', value: d.dec })}>
                        <span className="vd-bd-name">{d.dec}s</span>
                        <span className="vd-bd-count">{d.count}</span>
                        <span className={`vd-bd-mean ${scoreClass(d.mean)}`}>{fmt(d.mean, 1)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {dyTarget && (
        <DirectorYearModal
          type={dyTarget.type}
          value={dyTarget.value}
          voter={selectedVoter}
          onClose={() => setDyTarget(null)}
        />
      )}

      {modalId && (
        <MovieModal
          movieId={modalId}
          onClose={() => setModalId(null)}
          onSaved={handleSaved}
          onDeleted={id => setMovies(ms => ms.filter(m => m.id !== id))}
        />
      )}
    </div>
  );
}
