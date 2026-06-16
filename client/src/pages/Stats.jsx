import { useState, useEffect, useMemo } from 'react';
import { api } from '../api';
import MovieModal from '../components/MovieModal';
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

    // top3 count
    const top3Count = movies.reduce((acc, m) => acc + (m.top3?.[voter] != null ? 1 : 0), 0);

    // fav director (min 2 rated, highest mean score by this voter)
    const dirMap = {};
    for (const m of myFilms) {
      if (!m.director) continue;
      if (!dirMap[m.director]) dirMap[m.director] = [];
      dirMap[m.director].push(m.ratings[voter]);
    }
    const favDirector = Object.entries(dirMap)
      .filter(([, scores]) => scores.length >= 2)
      .sort((a, b) => avg(b[1]) - avg(a[1]))[0]?.[0] ?? null;

    // fav decade (min 2 rated, highest mean)
    const decMap = {};
    for (const m of myFilms) {
      const yr = parseInt(m.year);
      if (!yr) continue;
      const dec = Math.floor(yr / 10) * 10;
      if (!decMap[dec]) decMap[dec] = [];
      decMap[dec].push(m.ratings[voter]);
    }
    const favDecade = Object.entries(decMap)
      .filter(([, scores]) => scores.length >= 2)
      .sort((a, b) => avg(b[1]) - avg(a[1]))[0]?.[0] ?? null;

    // score distribution — bucket by whole number (floor)
    const dist = {};
    for (const s of scores) {
      const bucket = Math.floor(s);
      dist[bucket] = (dist[bucket] || 0) + 1;
    }

    return { voter, ratedCount: myFilms.length, mean, top3Count, favDirector, favDecade, dist };
  });
}

function avg(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length; }

export default function Stats() {
  const [movies, setMovies]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalId, setModalId] = useState(null);
  const [h2hA, setH2hA]      = useState(VOTERS[0]);
  const [h2hB, setH2hB]      = useState(VOTERS[1]);
  const { toast, Toast }      = useToast();

  useEffect(() => {
    api.getMovies({}).then(setMovies).finally(() => setLoading(false));
  }, []);

  function handleSaved(updated) {
    setMovies(ms => ms.map(m => m.id === updated.id ? { ...m, ...updated } : m));
    toast('Saved!');
  }

  const stats = useMemo(() => computeStats(movies), [movies]);

  // Head-to-head
  const h2h = useMemo(() => {
    if (h2hA === h2hB) return [];
    return movies
      .filter(m => m.ratings?.[h2hA] != null && m.ratings?.[h2hB] != null)
      .sort((a, b) => {
        const diff = Math.abs(a.ratings[h2hA] - a.ratings[h2hB]) - Math.abs(b.ratings[h2hA] - b.ratings[h2hB]);
        return -diff; // most disagreed first
      });
  }, [movies, h2hA, h2hB]);

  const h2hMeanDiff = h2h.length
    ? h2h.reduce((acc, m) => acc + Math.abs(m.ratings[h2hA] - m.ratings[h2hB]), 0) / h2h.length
    : null;

  if (loading) return <div className="spinner" style={{ margin: '60px auto' }} />;

  return (
    <div className="stats-page">
      <Toast />

      {/* ── Voter Overview ── */}
      <section className="stats-section">
        <h2 className="stats-heading">Voter Overview</h2>
        <div className="stats-voter-cards">
          {stats.map(s => (
            <div key={s.voter} className="stats-voter-card">
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
                  <span className="stats-lbl">top 3 picks</span>
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

      {/* ── Head-to-Head ── */}
      <section className="stats-section">
        <h2 className="stats-heading">Head-to-Head</h2>
        <div className="h2h-controls">
          <select className="select" value={h2hA} onChange={e => setH2hA(e.target.value)}>
            {VOTERS.map(v => <option key={v}>{v}</option>)}
          </select>
          <span className="h2h-vs">vs</span>
          <select className="select" value={h2hB} onChange={e => setH2hB(e.target.value)}>
            {VOTERS.map(v => <option key={v}>{v}</option>)}
          </select>
          {h2hMeanDiff != null && (
            <span className="h2h-summary">
              {h2h.length} shared films · mean diff <strong>{fmt(h2hMeanDiff, 2)}</strong>
            </span>
          )}
        </div>

        {h2hA === h2hB ? (
          <p style={{ color: 'var(--text2)', marginTop: 16 }}>Select two different voters.</p>
        ) : h2h.length === 0 ? (
          <p style={{ color: 'var(--text2)', marginTop: 16 }}>No films rated by both voters.</p>
        ) : (
          <div className="h2h-list">
            <div className="h2h-header-row">
              <span className="h2h-film-col">Film</span>
              <span className="h2h-score-col">{h2hA.slice(0, 3)}</span>
              <span className="h2h-score-col">{h2hB.slice(0, 3)}</span>
              <span className="h2h-diff-col">Δ</span>
            </div>
            {h2h.map(m => {
              const sA = m.ratings[h2hA];
              const sB = m.ratings[h2hB];
              const diff = Math.abs(sA - sB);
              const aWins = sA > sB;
              return (
                <div key={m.id} className="h2h-row" onClick={() => setModalId(m.id)}>
                  <span className="h2h-film-col">
                    <span className="h2h-title">{m.title}</span>
                    <span className="h2h-meta">{m.director}{m.year ? ` · ${m.year}` : ''}</span>
                  </span>
                  <span className={`h2h-score-col h2h-score ${scoreClass(sA)}${aWins ? ' h2h-winner' : ''}`}>
                    {Number.isInteger(sA) ? sA : sA.toFixed(1)}
                  </span>
                  <span className={`h2h-score-col h2h-score ${scoreClass(sB)}${!aWins && sA !== sB ? ' h2h-winner' : ''}`}>
                    {Number.isInteger(sB) ? sB : sB.toFixed(1)}
                  </span>
                  <span className="h2h-diff-col">{diff === 0 ? '=' : fmt(diff, 1)}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

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
