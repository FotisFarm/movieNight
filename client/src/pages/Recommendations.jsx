import { useState, useEffect, useRef } from 'react';
import { api } from '../api';
import MovieModal from '../components/MovieModal';
import { useToast } from '../hooks/useToast.jsx';
import './Recommendations.css';

const VOTERS = ['Μητσέας', 'Παντελής', 'Στέλιας', 'Φώτης', 'Λεόντιος'];

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

function VoterPills({ ratings }) {
  return (
    <div className="rec-voter-pills">
      {VOTERS.map(v => {
        const score = ratings?.[v];
        const rated = score != null;
        return (
          <span key={v} className={`voter-pill${rated ? '' : ' voter-pill-empty'}`}>
            <span className="voter-abbr">{v.slice(0, 3)}</span>
            {rated && (
              <span className={`voter-score ${scoreClass(score)}`}>
                {Number.isInteger(score) ? score : score.toFixed(1)}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

const DEFAULTS = { search: '', filterMn: false, filterWl: false, filterVoter: '', filterDir: '', filterYear: '' };
const DEFAULT_WEIGHTS = { dw: 0.45, ew: 0.45, tw: 0.10 };

export default function Recommendations() {
  const [allFilms, setAllFilms] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [modalId, setModalId]   = useState(null);
  const { Toast, showToast }    = useToast();

  const [search,      setSearch]      = useState(DEFAULTS.search);
  const [filterMn,    setFilterMn]    = useState(DEFAULTS.filterMn);
  const [filterWl,    setFilterWl]    = useState(DEFAULTS.filterWl);
  const [filterVoter, setFilterVoter] = useState(DEFAULTS.filterVoter);
  const [filterDir,   setFilterDir]   = useState(DEFAULTS.filterDir);
  const [filterYear,  setFilterYear]  = useState(DEFAULTS.filterYear);

  const [dw, setDw] = useState(DEFAULT_WEIGHTS.dw);
  const [ew, setEw] = useState(DEFAULT_WEIGHTS.ew);
  const [tw, setTw] = useState(DEFAULT_WEIGHTS.tw);

  const weightTimer = useRef(null);

  useEffect(() => {
    clearTimeout(weightTimer.current);
    weightTimer.current = setTimeout(() => {
      setLoading(true);
      api.getRecommendations({ dw, ew, tw }).then(setAllFilms).finally(() => setLoading(false));
    }, 400);
  }, [dw, ew, tw]);

  // Normalised display percentages
  const wTotal = dw + ew + tw || 1;
  const pDir = Math.round((dw / wTotal) * 100);
  const pEra = Math.round((ew / wTotal) * 100);
  const pTop = Math.round((tw / wTotal) * 100);

  const directors = [...new Set(allFilms.map(f => f.director).filter(Boolean))].sort();

  const filtersActive = search || filterMn || filterWl || filterVoter || filterDir || filterYear;

  function resetFilters() {
    setSearch(''); setFilterMn(false); setFilterWl(false);
    setFilterVoter(''); setFilterDir(''); setFilterYear('');
  }

  const films = allFilms.filter(f => {
    if (filterMn  && !f.mn)       return false;
    if (filterWl  && !f.watchlist) return false;
    if (filterDir && f.director !== filterDir) return false;
    if (filterYear && f.year !== filterYear)   return false;
    if (filterVoter && f.ratings?.[filterVoter] == null) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!f.title.toLowerCase().includes(q) && !f.director?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  function handleSaved(updated) {
    setAllFilms(f => f.map(x => x.id === updated.id ? { ...x, ...updated } : x));
    showToast('Saved');
  }

  function handleDeleted(id) {
    setAllFilms(f => f.filter(x => x.id !== id));
  }

  return (
    <div>
      <Toast />

      {/* Filters */}
      <div className="films-filters">
        <div className="filter-row">
          <div className="search-box" style={{ maxWidth: 280 }}>
            <span className="search-icon">🔍</span>
            <input
              className="input search-input"
              placeholder="Search…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && <button className="search-clear" onClick={() => setSearch('')}>✕</button>}
          </div>

          <div className="filter-sep" />

          <label className="filter-check filter-check-mn">
            <input type="checkbox" checked={filterMn} onChange={e => setFilterMn(e.target.checked)} />
            Movie Night
          </label>
          <label className="filter-check">
            <input type="checkbox" checked={filterWl} onChange={e => setFilterWl(e.target.checked)} />
            Watchlist
          </label>

          <div className="filter-sep" />

          <label className="filter-item">
            Voter
            <select className="select select-sm" value={filterVoter} onChange={e => setFilterVoter(e.target.value)}>
              <option value="">All</option>
              {VOTERS.map(v => <option key={v}>{v}</option>)}
            </select>
          </label>

          <label className="filter-item">
            Director
            <select className="select select-sm" value={filterDir} onChange={e => setFilterDir(e.target.value)}>
              <option value="">All</option>
              {directors.map(d => <option key={d}>{d}</option>)}
            </select>
          </label>

          <label className="filter-item">
            Year
            <input className="input input-sm" style={{ width: 74 }} placeholder="1972"
              value={filterYear} onChange={e => setFilterYear(e.target.value)} />
          </label>

          <div className="filter-sep" />

          <button
            className={`btn btn-sm${filtersActive ? ' btn-ghost filter-reset-active' : ' btn-ghost'}`}
            onClick={resetFilters}
            disabled={!filtersActive}
          >
            Reset
          </button>

          <span className="filter-count">{films.length} / {allFilms.length} picks</span>
        </div>
      </div>

      {/* Bias sliders */}
      <div className="recs-biases">
        <span className="recs-bias-label">Bias</span>
        <label className="recs-bias-item">
          <span>Director <em>{pDir}%</em></span>
          <input type="range" min={0} max={10} step={1} value={Math.round(dw * 10)}
            onChange={e => setDw(parseFloat(e.target.value) / 10)} />
        </label>
        <label className="recs-bias-item">
          <span>Era <em>{pEra}%</em></span>
          <input type="range" min={0} max={10} step={1} value={Math.round(ew * 10)}
            onChange={e => setEw(parseFloat(e.target.value) / 10)} />
        </label>
        <label className="recs-bias-item">
          <span>Top 3 <em>{pTop}%</em></span>
          <input type="range" min={0} max={10} step={1} value={Math.round(tw * 10)}
            onChange={e => setTw(parseFloat(e.target.value) / 10)} />
        </label>
        <button className="btn btn-ghost btn-sm" onClick={() => { setDw(DEFAULT_WEIGHTS.dw); setEw(DEFAULT_WEIGHTS.ew); setTw(DEFAULT_WEIGHTS.tw); }}>
          Reset
        </button>
      </div>

      {/* List */}
      <div className="recs-page">
        <div className="recs-header">
          <h1 className="recs-title">Picks</h1>
          <p className="recs-sub">Films ranked by predicted group enjoyment · click to rate</p>
        </div>

        {loading ? (
          <div className="spinner" style={{ margin: '60px auto' }} />
        ) : films.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--text2)', marginTop: 60 }}>No films match your filters.</p>
        ) : (
          <ol className="recs-list">
            {films.map((f, i) => (
              <li key={f.id} className="rec-row" onClick={() => setModalId(f.id)}>
                <div className="rec-top">
                  <span className="rec-rank">#{i + 1}</span>
                  <div className="rec-title-block">
                    <div className="rec-title-row">
                      <span className="rec-title">{f.title}</span>
                      <div className="rec-badges">
                        {f.mn        && <span className="badge badge-mn">MN</span>}
                        {f.watchlist && <span className="badge badge-wl">WL</span>}
                      </div>
                    </div>
                    <span className="rec-meta">{f.director}{f.year ? ` · ${f.year}` : ''}</span>
                  </div>
                  <div className={`rec-score ${scoreClass(f.predictedScore)}`}>
                    {fmt(f.predictedScore)}
                  </div>
                </div>

                <div className="rec-bottom">
                  <VoterPills ratings={f.ratings} />
                  <div className="rec-detail">
                    {f.actualScore != null && (
                      <span className="rec-actual">
                        Current <strong className={scoreClass(f.actualScore)}>{fmt(f.actualScore)}</strong>
                        <span className="rec-voters"> ({f.voterCount} voter{f.voterCount !== 1 ? 's' : ''})</span>
                      </span>
                    )}
                    {f.explanation && <span className="rec-explanation">{f.explanation}</span>}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      {modalId && (
        <MovieModal
          movieId={modalId}
          onClose={() => setModalId(null)}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  );
}
