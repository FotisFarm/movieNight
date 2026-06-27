import { useState, useEffect, useMemo, useRef } from 'react';
import { api } from '../api';
import MovieModal from '../components/MovieModal';
import RankIcon from '../components/RankIcon';
import './Compare.css';

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
function fmtScore(v) {
  if (v == null) return '–';
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

// Inline searchable movie picker (substring on title/director)
function MoviePicker({ movies, value, onChange, placeholder }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    function onDoc(e) { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  if (value) {
    return (
      <div className="cmp-picker" ref={boxRef}>
        <div className="cmp-picked">
          <span className="cmp-picked-title">{value.title}</span>
          <span className="cmp-picked-meta">{value.director}{value.year ? ` · ${value.year}` : ''}</span>
          <button className="cmp-picked-clear" onClick={() => onChange(null)}>✕</button>
        </div>
      </div>
    );
  }

  const matches = q.trim()
    ? movies.filter(m => {
        const s = q.toLowerCase();
        return m.title.toLowerCase().includes(s) || m.director?.toLowerCase().includes(s);
      }).slice(0, 8)
    : [];

  return (
    <div className="cmp-picker" ref={boxRef}>
      <input
        className="input"
        placeholder={placeholder}
        value={q}
        onChange={e => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
      />
      {open && matches.length > 0 && (
        <div className="cmp-dropdown">
          {matches.map(m => (
            <div key={m.id} className="cmp-dropdown-item" onClick={() => { onChange(m); setQ(''); setOpen(false); }}>
              <span className="cmp-dropdown-title">{m.title}</span>
              <span className="cmp-dropdown-meta">{m.director}{m.year ? ` · ${m.year}` : ''}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const AGG = [
  { key: 'fairBoosted',  label: 'Fair score',  higher: true },
  { key: 'boostedScore', label: 'Group score', higher: true },
  { key: 'fairScore',    label: 'Mean',        higher: true },
  { key: 'stdDev',       label: 'Std dev',     higher: false },
  { key: 'voterCount',   label: 'Voters',      higher: true, plain: true },
];

export default function Compare() {
  const [movies, setMovies]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode]       = useState('movies'); // 'movies' | 'voters'
  const [modalId, setModalId] = useState(null);

  // movie mode (store ids, resolve from movies so edits stay fresh)
  const [aId, setAId] = useState(null);
  const [bId, setBId] = useState(null);
  // voter mode
  const [vA, setVA] = useState(VOTERS[0]);
  const [vB, setVB] = useState(VOTERS[1]);

  useEffect(() => {
    api.getMovies({}).then(setMovies).finally(() => setLoading(false));
  }, []);

  function handleSaved(updated) {
    setMovies(ms => ms.map(m => m.id === updated.id ? { ...m, ...updated } : m));
  }

  const filmA = movies.find(m => m.id === aId) || null;
  const filmB = movies.find(m => m.id === bId) || null;

  const movieCmp = useMemo(() => {
    if (!filmA || !filmB) return null;
    const rows = VOTERS
      .filter(v => filmA.ratings?.[v] != null || filmB.ratings?.[v] != null)
      .map(v => ({ voter: v, a: filmA.ratings?.[v] ?? null, b: filmB.ratings?.[v] ?? null }));
    let aWins = 0, bWins = 0, ties = 0;
    for (const r of rows) {
      if (r.a == null || r.b == null) continue;
      if (r.a > r.b) aWins++; else if (r.b > r.a) bWins++; else ties++;
    }
    return { rows, aWins, bWins, ties };
  }, [filmA, filmB]);

  const voterCmp = useMemo(() => {
    if (vA === vB) return null;
    const shared = movies.filter(m => m.ratings?.[vA] != null && m.ratings?.[vB] != null);
    const sameFilms = [], aHigherFilms = [], bHigherFilms = [], agreeFilms = [];
    for (const m of shared) {
      const sA = m.ratings[vA], sB = m.ratings[vB];
      const d = Math.abs(sA - sB);
      if (d > 0 && d <= 0.5) agreeFilms.push(m); // close but not identical
      if (sA === sB) sameFilms.push(m);
      else if (sA > sB) aHigherFilms.push(m);
      else bHigherFilms.push(m);
    }
    agreeFilms.sort((a, b) => Math.abs(a.ratings[vA] - a.ratings[vB]) - Math.abs(b.ratings[vA] - b.ratings[vB]));
    // larger gap first within each bucket
    aHigherFilms.sort((a, b) => (b.ratings[vA] - b.ratings[vB]) - (a.ratings[vA] - a.ratings[vB]));
    bHigherFilms.sort((a, b) => (b.ratings[vB] - b.ratings[vA]) - (a.ratings[vB] - a.ratings[vA]));
    const onlyA = movies.filter(m => m.ratings?.[vA] != null && m.ratings?.[vB] == null);
    const onlyB = movies.filter(m => m.ratings?.[vB] != null && m.ratings?.[vA] == null);
    const top3Both = movies.filter(m => m.top3?.[vA] != null && m.top3?.[vB] != null);
    const top3A = movies.filter(m => m.top3?.[vA] != null).sort((a, b) => a.top3[vA] - b.top3[vA]);
    const top3B = movies.filter(m => m.top3?.[vB] != null).sort((a, b) => a.top3[vB] - b.top3[vB]);
    const disagreements = [...shared].sort((a, b) =>
      Math.abs(b.ratings[vA] - b.ratings[vB]) - Math.abs(a.ratings[vA] - a.ratings[vB]));
    const n = shared.length;
    // each voter's overall average across all their ratings
    const mean = v => {
      const arr = movies.filter(m => m.ratings?.[v] != null).map(m => m.ratings[v]);
      return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
    };
    const avgA = mean(vA), avgB = mean(vB);
    // average rating on the films only each voter watched
    const meanOf = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
    const soloAvgA = meanOf(onlyA.map(m => m.ratings[vA]));
    const soloAvgB = meanOf(onlyB.map(m => m.ratings[vB]));
    return {
      n,
      same: sameFilms.length, aHigher: aHigherFilms.length, bHigher: bHigherFilms.length,
      sameFilms, aHigherFilms, bHigherFilms,
      agree: agreeFilms.length, agreeFilms,
      avgA, avgB,
      avgDiff: (avgA != null && avgB != null) ? Math.abs(avgA - avgB) : null,
      onlyA, onlyB, top3Both, top3A, top3B, disagreements,
      soloAvgA, soloAvgB,
      soloAvgDiff: (soloAvgA != null && soloAvgB != null) ? Math.abs(soloAvgA - soloAvgB) : null,
    };
  }, [movies, vA, vB]);

  // a labelled <details> listing films with both voters' scores + a short-name header
  const pairList = (label, films) => (
    <details key={label} className="cmp-details">
      <summary>{label}</summary>
      {films.length > 0 && (
        <div className="cmp-mini-row cmp-mini-head">
          <span className="cmp-mini-title" />
          <span className="cmp-mini-col">{vA.slice(0, 3)}</span>
          <span className="cmp-mini-sep" />
          <span className="cmp-mini-col">{vB.slice(0, 3)}</span>
        </div>
      )}
      {films.map(m => (
        <div key={m.id} className="cmp-mini-row" onClick={() => setModalId(m.id)}>
          <span className="cmp-mini-title">{m.title}</span>
          <span className={`cmp-score ${scoreClass(m.ratings[vA])}`}>{fmtScore(m.ratings[vA])}</span>
          <span className="cmp-mini-sep">·</span>
          <span className={`cmp-score ${scoreClass(m.ratings[vB])}`}>{fmtScore(m.ratings[vB])}</span>
        </div>
      ))}
    </details>
  );

  if (loading) return <div className="spinner" style={{ margin: '60px auto' }} />;

  return (
    <div className="compare-page">
      <div className="cmp-mode-bar">
        <div className="view-toggle">
          <button className={`view-btn${mode === 'movies' ? ' active' : ''}`} onClick={() => setMode('movies')}>Movies</button>
          <button className={`view-btn${mode === 'voters' ? ' active' : ''}`} onClick={() => setMode('voters')}>Voters</button>
        </div>
      </div>

      {/* ─────────── MOVIE vs MOVIE ─────────── */}
      {mode === 'movies' && (
        <section className="stats-section">
          <div className="cmp-pickers">
            <MoviePicker movies={movies} value={filmA} onChange={m => setAId(m?.id ?? null)} placeholder="Search film A…" />
            <span className="cmp-vs">vs</span>
            <MoviePicker movies={movies} value={filmB} onChange={m => setBId(m?.id ?? null)} placeholder="Search film B…" />
          </div>

          {!filmA || !filmB ? (
            <p className="cmp-empty">Pick two films to compare.</p>
          ) : (
            <>
              {/* Per-voter scores */}
              <div className="cmp-grid">
                <div className="cmp-head-row">
                  <span className="cmp-label-col">Voter</span>
                  <span className="cmp-score-col cmp-film-head" onClick={() => setModalId(filmA.id)}>{filmA.title}</span>
                  <span className="cmp-score-col cmp-film-head" onClick={() => setModalId(filmB.id)}>{filmB.title}</span>
                </div>
                {movieCmp.rows.map(r => {
                  const aWin = r.a != null && r.b != null && r.a > r.b;
                  const bWin = r.a != null && r.b != null && r.b > r.a;
                  return (
                    <div key={r.voter} className="cmp-row">
                      <span className="cmp-label-col">{r.voter}</span>
                      <span className={`cmp-score-col cmp-score ${scoreClass(r.a)}${aWin ? ' cmp-winner' : ''}`}>{fmtScore(r.a)}</span>
                      <span className={`cmp-score-col cmp-score ${scoreClass(r.b)}${bWin ? ' cmp-winner' : ''}`}>{fmtScore(r.b)}</span>
                    </div>
                  );
                })}
              </div>
              <div className="cmp-tally">
                <span><strong>{filmA.title}</strong> preferred by {movieCmp.aWins}</span>
                <span className="cmp-tally-sep">·</span>
                <span>{movieCmp.ties} tie{movieCmp.ties !== 1 ? 's' : ''}</span>
                <span className="cmp-tally-sep">·</span>
                <span><strong>{filmB.title}</strong> preferred by {movieCmp.bWins}</span>
                <span className="cmp-tally-note">(voters who rated both)</span>
              </div>

              {/* Aggregate scores */}
              <h3 className="cmp-subhead">Aggregate</h3>
              <div className="cmp-grid">
                {AGG.map(({ key, label, higher, plain }) => {
                  const a = filmA[key], b = filmB[key];
                  const aBetter = a != null && b != null && a !== b && (higher ? a > b : a < b);
                  const bBetter = a != null && b != null && a !== b && (higher ? b > a : b < a);
                  const cls = v => plain ? '' : ` ${scoreClass(v)}`;
                  return (
                    <div key={key} className="cmp-row">
                      <span className="cmp-label-col">{label}</span>
                      <span className={`cmp-score-col cmp-score${cls(a)}${aBetter ? ' cmp-winner' : ''}`}>{plain ? (a ?? '–') : fmt(a)}</span>
                      <span className={`cmp-score-col cmp-score${cls(b)}${bBetter ? ' cmp-winner' : ''}`}>{plain ? (b ?? '–') : fmt(b)}</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>
      )}

      {/* ─────────── VOTER vs VOTER ─────────── */}
      {mode === 'voters' && (
        <section className="stats-section">
          <div className="cmp-pickers">
            <select className="select" value={vA} onChange={e => setVA(e.target.value)}>
              {VOTERS.map(v => <option key={v}>{v}</option>)}
            </select>
            <span className="cmp-vs">vs</span>
            <select className="select" value={vB} onChange={e => setVB(e.target.value)}>
              {VOTERS.map(v => <option key={v}>{v}</option>)}
            </select>
          </div>

          {vA === vB ? (
            <p className="cmp-empty">Select two different voters.</p>
          ) : voterCmp.n === 0 ? (
            <p className="cmp-empty">No films rated by both voters.</p>
          ) : (
            <div className="cmp-cols">
              {/* ── SHARED ── */}
              <div className="cmp-col">
                <h3 className="cmp-col-head">Shared films — {voterCmp.n}</h3>

                <div className="cmp-stat-cards">
                  <div className="cmp-stat cmp-stat-avg">
                    <span className="cmp-stat-val">{voterCmp.same}</span>
                    <span className="cmp-stat-lbl">identical</span>
                    <span className="cmp-stat-sub">{voterCmp.same} out of {voterCmp.n} · {Math.round(voterCmp.same / voterCmp.n * 100)}%</span>
                  </div>
                  <div className="cmp-stat"><span className="cmp-stat-val">{voterCmp.aHigher}</span><span className="cmp-stat-lbl">{vA} higher</span></div>
                  <div className="cmp-stat"><span className="cmp-stat-val">{voterCmp.bHigher}</span><span className="cmp-stat-lbl">{vB} higher</span></div>
                  <div className="cmp-stat"><span className="cmp-stat-val">{voterCmp.agree}</span><span className="cmp-stat-lbl">Almost Agree (±0.5)</span></div>
                  <div className="cmp-stat cmp-stat-avg">
                    <span className="cmp-stat-val">{fmt(voterCmp.avgDiff, 2)}</span>
                    <span className="cmp-stat-lbl">avg rating difference</span>
                    <span className="cmp-stat-sub">{vA} {fmt(voterCmp.avgA, 1)} · {vB} {fmt(voterCmp.avgB, 1)}</span>
                  </div>
                </div>

                <div className="cmp-detail-stack">
                  {/* Agreement breakdown */}
                  <div>
                    <h4 className="cmp-detail-head">Agreement breakdown</h4>
                    <div className="cmp-detail-rows">
                      <div className="cmp-detail-row">
                        {pairList(`${vA} higher — ${voterCmp.aHigher}`, voterCmp.aHigherFilms)}
                        {pairList(`${vB} higher — ${voterCmp.bHigher}`, voterCmp.bHigherFilms)}
                      </div>
                      <div className="cmp-detail-row">
                        {pairList(`Identical — ${voterCmp.same}`, voterCmp.sameFilms)}
                        {pairList(`Almost Agree ±0.5 — ${voterCmp.agree}`, voterCmp.agreeFilms)}
                      </div>
                    </div>
                  </div>

                  {/* Top 10 overlap */}
                  <div>
                    <h4 className="cmp-detail-head">Top 10 overlap — {voterCmp.top3Both.length} shared</h4>
                    {voterCmp.top3Both.length > 0 && (
                      <div className="cmp-top3-shared">
                        {voterCmp.top3Both.map(m => (
                          <span key={m.id} className="cmp-chip" onClick={() => setModalId(m.id)}>{m.title}</span>
                        ))}
                      </div>
                    )}
                    <div className="cmp-detail-row">
                      <details className="cmp-details">
                        <summary>{vA}'s Top 10</summary>
                        {voterCmp.top3A.map(m => (
                          <div key={m.id} className="cmp-mini-row" onClick={() => setModalId(m.id)}>
                            <span className="cmp-rank"><RankIcon rank={m.top3[vA]} /></span>
                            <span className="cmp-mini-title">{m.title}</span>
                          </div>
                        ))}
                      </details>
                      <details className="cmp-details">
                        <summary>{vB}'s Top 10</summary>
                        {voterCmp.top3B.map(m => (
                          <div key={m.id} className="cmp-mini-row" onClick={() => setModalId(m.id)}>
                            <span className="cmp-rank"><RankIcon rank={m.top3[vB]} /></span>
                            <span className="cmp-mini-title">{m.title}</span>
                          </div>
                        ))}
                      </details>
                    </div>
                  </div>

                  {/* Biggest disagreements */}
                  <div>
                    <h4 className="cmp-detail-head">Biggest disagreements</h4>
                    <div className="cmp-grid cmp-grid-diff">
                      <div className="cmp-head-row">
                        <span className="cmp-label-col">Film</span>
                        <span className="cmp-score-col">{vA}</span>
                        <span className="cmp-score-col">{vB}</span>
                        <span className="cmp-diff-col">Δ</span>
                      </div>
                      {voterCmp.disagreements.slice(0, 15).map(m => {
                        const sA = m.ratings[vA], sB = m.ratings[vB];
                        const d = Math.abs(sA - sB);
                        return (
                          <div key={m.id} className="cmp-row cmp-row-clickable" onClick={() => setModalId(m.id)}>
                            <span className="cmp-label-col cmp-film-cell">
                              <span className="cmp-film-title">{m.title}</span>
                              <span className="cmp-film-meta">{m.director}{m.year ? ` · ${m.year}` : ''}</span>
                            </span>
                            <span className={`cmp-score-col cmp-score ${scoreClass(sA)}${sA > sB ? ' cmp-winner' : ''}`}>{fmtScore(sA)}</span>
                            <span className={`cmp-score-col cmp-score ${scoreClass(sB)}${sB > sA ? ' cmp-winner' : ''}`}>{fmtScore(sB)}</span>
                            <span className="cmp-diff-col">{d === 0 ? '=' : fmt(d, 1)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* ── NOT SHARED ── */}
              <div className="cmp-col">
                <h3 className="cmp-col-head">Not shared — {voterCmp.onlyA.length + voterCmp.onlyB.length}</h3>

                <div className="cmp-stat-cards">
                  <div className="cmp-stat"><span className="cmp-stat-val">{voterCmp.onlyA.length}</span><span className="cmp-stat-lbl">{vA} only</span></div>
                  <div className="cmp-stat"><span className="cmp-stat-val">{voterCmp.onlyB.length}</span><span className="cmp-stat-lbl">{vB} only</span></div>
                  <div className="cmp-stat cmp-stat-avg">
                    <span className="cmp-stat-val">{fmt(voterCmp.soloAvgDiff, 2)}</span>
                    <span className="cmp-stat-lbl">avg rating difference</span>
                    <span className="cmp-stat-sub">{vA} {fmt(voterCmp.soloAvgA, 1)} · {vB} {fmt(voterCmp.soloAvgB, 1)}</span>
                  </div>
                </div>

                <div className="cmp-detail-row">
                  <details className="cmp-details cmp-details-scroll" open>
                    <summary>{vA} only — {voterCmp.onlyA.length} films</summary>
                    {voterCmp.onlyA.map(m => (
                      <div key={m.id} className="cmp-mini-row" onClick={() => setModalId(m.id)}>
                        <span className="cmp-mini-title">{m.title}</span>
                        <span className={`cmp-score ${scoreClass(m.ratings[vA])}`}>{fmtScore(m.ratings[vA])}</span>
                      </div>
                    ))}
                  </details>
                  <details className="cmp-details cmp-details-scroll" open>
                    <summary>{vB} only — {voterCmp.onlyB.length} films</summary>
                    {voterCmp.onlyB.map(m => (
                      <div key={m.id} className="cmp-mini-row" onClick={() => setModalId(m.id)}>
                        <span className="cmp-mini-title">{m.title}</span>
                        <span className={`cmp-score ${scoreClass(m.ratings[vB])}`}>{fmtScore(m.ratings[vB])}</span>
                      </div>
                    ))}
                  </details>
                </div>
              </div>
            </div>
          )}
        </section>
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
