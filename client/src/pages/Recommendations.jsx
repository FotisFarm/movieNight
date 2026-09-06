import { useState, useEffect, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import { api } from '../api';
import MovieModal from '../components/MovieModal';
import WatchlistBadge from '../components/WatchlistBadge';
import LetterboxdPill from '../components/LetterboxdPill';
import { useToast } from '../hooks/useToast.jsx';
import { useAppConfig } from '../AppConfigContext';
import { fmt, scoreClass, formatRuntime } from '../utils';
import './Recommendations.css';

function VoterPills({ ratings, voters }) {
  return (
    <div className="rec-voter-pills">
      {voters.map(v => {
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

const DEFAULTS = { search: '', filterMn: false, filterWl: false, filterDir: '', filterYear: '', filterMinLb: '', filterGems: false };
const DEFAULT_WEIGHTS = { dw: 0.35, lbw: 0.40, ew: 0.25, tw: 0.10, maxVoters: 2, minDirFilms: 2 };

export default function Recommendations() {
  const { voters } = useAppConfig();
  const [allFilms, setAllFilms] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [modalId, setModalId]   = useState(null);
  const { toast, Toast }        = useToast();

  const [search,      setSearch]      = useState(DEFAULTS.search);
  const [filterMn,    setFilterMn]    = useState(DEFAULTS.filterMn);
  const [filterWl,    setFilterWl]    = useState(DEFAULTS.filterWl);
  const [filterDir,   setFilterDir]   = useState(DEFAULTS.filterDir);
  const [filterYear,  setFilterYear]  = useState(DEFAULTS.filterYear);
  const [filterMinLb, setFilterMinLb] = useState(DEFAULTS.filterMinLb);
  const [filterGems,  setFilterGems]  = useState(DEFAULTS.filterGems);

  const [dw, setDw]   = useState(DEFAULT_WEIGHTS.dw);
  const [lbw, setLbw] = useState(DEFAULT_WEIGHTS.lbw);
  const [ew, setEw]   = useState(DEFAULT_WEIGHTS.ew);
  const [tw, setTw]   = useState(DEFAULT_WEIGHTS.tw);
  const [maxVoters, setMaxVoters] = useState(DEFAULT_WEIGHTS.maxVoters);
  const [minDirFilms, setMinDirFilms] = useState(() => parseInt(localStorage.getItem('mn_minDirFilms')) || DEFAULT_WEIGHTS.minDirFilms);
  const [unvotedBy, setUnvotedBy] = useState(new Set());
  const [onePerDirector, setOnePerDirector] = useState(() => {
    return localStorage.getItem('mn_onePerDirector') === 'true';
  });

  const weightTimer = useRef(null);

  useEffect(() => {
    clearTimeout(weightTimer.current);
    weightTimer.current = setTimeout(() => {
      setLoading(true);
      api.getRecommendations({ dw, lbw, ew, tw, maxVoters, minDirFilms }).then(setAllFilms).finally(() => setLoading(false));
    }, 400);
  }, [dw, lbw, ew, tw, maxVoters, minDirFilms]);

  function changeMinDirFilms(n) {
    setMinDirFilms(n);
    localStorage.setItem('mn_minDirFilms', n);
  }

  function toggleUnvotedBy(voter) {
    setUnvotedBy(prev => {
      const next = new Set(prev);
      next.has(voter) ? next.delete(voter) : next.add(voter);
      return next;
    });
  }

  function toggleOnePerDirector() {
    setOnePerDirector(prev => {
      const next = !prev;
      localStorage.setItem('mn_onePerDirector', String(next));
      return next;
    });
  }

  // Base prior weights (Director + Letterboxd + Era = 100%)
  const baseTotal = dw + lbw + ew || 1;
  const pDir = Math.round((dw / baseTotal) * 100);
  const pLb  = Math.round((lbw / baseTotal) * 100);
  const pEra = Math.max(0, 100 - pDir - pLb);
  // Additive Top 10 Halo Boost strength
  const boostMultiplier = (tw / 0.10).toFixed(1);
  const boostLabel = tw <= 0.001 ? 'Off (0×)' : `${boostMultiplier}×`;

  // CSS variable cascades into ::webkit-slider-runnable-track pseudo-element
  function trackStyle(val, max = 1) {
    const pct = Math.min(100, Math.max(0, Math.round((val / max) * 100)));
    return { '--fill': `${pct}%` };
  }

  const directors = [...new Set(allFilms.map(f => f.director).filter(Boolean))].sort();

  const filtersActive = Boolean(
    search || filterMn || filterWl || filterDir || filterYear ||
    filterMinLb || filterGems || unvotedBy.size > 0 || onePerDirector
  );

  function resetFilters() {
    setSearch('');
    setFilterMn(false);
    setFilterWl(false);
    setFilterDir('');
    setFilterYear('');
    setFilterMinLb('');
    setFilterGems(false);
    setUnvotedBy(new Set());
    setOnePerDirector(false);
    localStorage.removeItem('mn_onePerDirector');
  }

  const weightsModified = Boolean(
    Math.abs(dw - DEFAULT_WEIGHTS.dw) > 0.001 ||
    Math.abs(lbw - DEFAULT_WEIGHTS.lbw) > 0.001 ||
    Math.abs(ew - DEFAULT_WEIGHTS.ew) > 0.001 ||
    Math.abs(tw - DEFAULT_WEIGHTS.tw) > 0.001 ||
    maxVoters !== DEFAULT_WEIGHTS.maxVoters ||
    minDirFilms !== DEFAULT_WEIGHTS.minDirFilms
  );

  function resetWeights() {
    setDw(DEFAULT_WEIGHTS.dw);
    setLbw(DEFAULT_WEIGHTS.lbw);
    setEw(DEFAULT_WEIGHTS.ew);
    setTw(DEFAULT_WEIGHTS.tw);
    setMaxVoters(DEFAULT_WEIGHTS.maxVoters);
    changeMinDirFilms(DEFAULT_WEIGHTS.minDirFilms);
  }

  const seenDirectors = new Set();
  const films = allFilms.filter(f => {
    if (filterMn  && !f.mn)        return false;
    if (filterWl  && !f.watchlist) return false;
    if (filterDir && f.director !== filterDir) return false;
    if (filterYear && f.year !== filterYear)   return false;
    if (filterMinLb && (f.letterboxd_rating == null || f.letterboxd_rating < parseFloat(filterMinLb))) return false;
    if (filterGems) {
      const hasVotes = f.voterCount > 0 || (f.ratings && Object.keys(f.ratings).length > 0);
      if (hasVotes || f.letterboxd_rating == null || f.letterboxd_rating < 3.8) return false;
    }
    if (unvotedBy.size > 0) {
      for (const v of unvotedBy) {
        if (f.ratings?.[v] != null) return false;
      }
    }
    if (search) {
      const q = search.toLowerCase();
      if (!f.title.toLowerCase().includes(q) && !f.director?.toLowerCase().includes(q)) return false;
    }
    if (onePerDirector) {
      const dirKey = f.director ? f.director.trim().toLowerCase() : null;
      if (dirKey) {
        if (seenDirectors.has(dirKey)) return false;
        seenDirectors.add(dirKey);
      }
    }
    return true;
  });

  function handleSaved(updated) {
    setAllFilms(f => f.map(x => x.id === updated.id ? { ...x, ...updated } : x));
    toast('Saved');
  }

  function handleDeleted(id) {
    setAllFilms(f => f.filter(x => x.id !== id));
  }

  async function handleWatchlistToggle(id, nextWl) {
    const target = allFilms.find(f => f.id === id);
    const title = target?.title ? `"${target.title}"` : 'Film';
    setAllFilms(fs => fs.map(f => f.id === id ? { ...f, watchlist: nextWl } : f));
    toast(nextWl ? `Added ${title} to Watchlist` : `Removed ${title} from Watchlist`);
    try {
      await api.updateMovie(id, { watchlist: nextWl });
    } catch (err) {
      console.error(err);
      setAllFilms(fs => fs.map(f => f.id === id ? { ...f, watchlist: !nextWl } : f));
      toast(`Failed to update Watchlist for ${title}`);
    }
  }

  return (
    <div>
      <Toast />

      {/* ── Subnav between Picks & Prediction Accuracy ── */}
      <div className="preds-subnav-bar">
        <div className="preds-nav-tabs">
          <NavLink to="/recommendations" className="preds-nav-tab active">
            🎯 Picks
          </NavLink>
          <NavLink to="/predictions" className="preds-nav-tab">
            🔮 Accuracy
          </NavLink>
        </div>
      </div>

      {/* ── Movie Discovery Filters ── */}
      <div className="films-filters recs-filters-bar">
        <div className="filter-row">
          <div className="search-box" style={{ maxWidth: 240 }}>
            <span className="search-icon">🔍</span>
            <input
              className="input search-input"
              placeholder="Search picks, directors…"
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
          <label className="filter-check filter-check-director" title="Show only the highest predicted film for each director to avoid clustering">
            <input type="checkbox" checked={onePerDirector} onChange={toggleOnePerDirector} />
            1 per Director
          </label>
          <label className="filter-check filter-check-gems" title="Show unvoted gems with Letterboxd rating ≥ 3.8 ★">
            <input type="checkbox" checked={filterGems} onChange={e => setFilterGems(e.target.checked)} />
            ✨ Gems
          </label>

          <div className="filter-sep" />

          <div className="recs-unvoted-cluster">
            <span className="recs-filter-tag">Unvoted by</span>
            <div className="recs-unvoted-pills">
              {voters.map(v => (
                <button
                  key={v}
                  type="button"
                  className={`voter-pill-toggle${unvotedBy.has(v) ? ' active' : ''}`}
                  onClick={() => toggleUnvotedBy(v)}
                  title={`Show only films not yet rated by ${v}`}
                >
                  {v.slice(0, 3)}
                </button>
              ))}
            </div>
          </div>

          <div className="filter-sep" />

          <label className="filter-item-inline">
            <span className="filter-label">Director</span>
            <select className="select select-sm" value={filterDir} onChange={e => setFilterDir(e.target.value)} style={{ maxWidth: 160 }}>
              <option value="">All Directors</option>
              {directors.map(d => <option key={d}>{d}</option>)}
            </select>
          </label>

          <label className="filter-item-inline">
            <span className="filter-label">Year</span>
            <input className="input input-sm" style={{ width: 68 }} placeholder="e.g. 1972"
              value={filterYear} onChange={e => setFilterYear(e.target.value)} />
          </label>

          <label className="filter-item-inline">
            <span className="filter-label">Min LB</span>
            <select className="select select-sm" value={filterMinLb} onChange={e => setFilterMinLb(e.target.value)}>
              <option value="">Any ★</option>
              <option value="3.5">≥ 3.5 ★</option>
              <option value="3.8">≥ 3.8 ★</option>
              <option value="4.0">≥ 4.0 ★</option>
            </select>
          </label>

          <div className="filter-sep" />

          <button
            type="button"
            className={`btn btn-sm${filtersActive ? ' btn-ghost filter-reset-active' : ' btn-ghost'}`}
            onClick={resetFilters}
            disabled={!filtersActive}
          >
            Reset Filters
          </button>

          <span className="filter-count">
            {films.length} / {allFilms.length} picks{onePerDirector ? ' · 1/dir' : ''}{filterGems ? ' · Gems' : ''}{filterMinLb ? ` · ≥${filterMinLb}★` : ''}
          </span>
        </div>
      </div>

      {/* ── Prediction Model & Weights Toolbar ── */}
      <div className="recs-biases">
        <div className="recs-model-badge">⚡ Model Weights</div>

        <label className="recs-bias-item">
          <span>Director Track <em>{pDir}%</em></span>
          <div className="recs-slider-wrap" style={trackStyle(dw, 1)}>
            <input type="range" min={0} max={1} step={0.05} value={dw}
              onChange={e => setDw(parseFloat(e.target.value))} />
          </div>
        </label>

        <label className="recs-bias-item">
          <span>Letterboxd <em>{pLb}%</em></span>
          <div className="recs-slider-wrap" style={trackStyle(lbw, 1)}>
            <input type="range" min={0} max={1} step={0.05} value={lbw}
              onChange={e => setLbw(parseFloat(e.target.value))} />
          </div>
        </label>

        <label className="recs-bias-item">
          <span>Decade Era <em>{pEra}%</em></span>
          <div className="recs-slider-wrap" style={trackStyle(ew, 1)}>
            <input type="range" min={0} max={1} step={0.05} value={ew}
              onChange={e => setEw(parseFloat(e.target.value))} />
          </div>
        </label>

        <label className="recs-bias-item" style={{ minWidth: 140 }}>
          <span>Top 10 Boost <em className="halo-boost-val">{boostLabel}</em></span>
          <div className="recs-slider-wrap" style={trackStyle(tw, 0.20)}>
            <input type="range" min={0} max={0.20} step={0.02} value={tw}
              onChange={e => setTw(parseFloat(e.target.value))} />
          </div>
        </label>

        <div className="recs-bias-sep" />

        <label className="recs-bias-item recs-bias-item--inline">
          <span className="recs-bias-label">Candidates</span>
          <select className="select select-sm" value={maxVoters} onChange={e => setMaxVoters(parseInt(e.target.value))}>
            {[0, 1, 2, 3, 4].map(n => (
              <option key={n} value={n}>≤ {n} {n === 1 ? 'vote' : 'votes'}</option>
            ))}
          </select>
        </label>

        <label className="recs-bias-item recs-bias-item--inline">
          <span className="recs-bias-label">Min dir films</span>
          <select className="select select-sm" value={minDirFilms} onChange={e => changeMinDirFilms(parseInt(e.target.value))}>
            {[1, 2, 3, 4].map(n => (
              <option key={n} value={n}>{n === 1 ? 'No min (1)' : `≥ ${n} films`}</option>
            ))}
          </select>
        </label>

        <div className="recs-bias-sep" />

        <button
          type="button"
          className={`btn btn-sm btn-ghost${weightsModified ? ' filter-reset-active' : ''}`}
          onClick={resetWeights}
          disabled={!weightsModified}
          title="Reset model weights to default"
        >
          Reset Model
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
                        <WatchlistBadge id={f.id} watchlist={f.watchlist} onToggle={handleWatchlistToggle} />
                        {(f.imdb_id || f.letterboxd_rating != null) && (
                          <LetterboxdPill imdbId={f.imdb_id} score={f.letterboxd_rating} />
                        )}
                      </div>
                    </div>
                    <span className="rec-meta">
                      {f.director}
                      {f.year ? ` · ${f.year}` : ''}
                      {f.runtime ? ` · ${formatRuntime(f.runtime)}` : ''}
                    </span>
                  </div>
                  <div className={`rec-score ${scoreClass(f.predictedScore)}`}>
                    {fmt(f.predictedScore)}
                  </div>
                </div>

                <div className="rec-bottom">
                  <VoterPills ratings={f.ratings} voters={voters} />
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
