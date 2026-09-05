import { useState, useEffect, useMemo } from 'react';
import { NavLink } from 'react-router-dom';
import { api } from '../api';
import MovieModal from '../components/MovieModal';
import WatchlistBadge from '../components/WatchlistBadge';
import { useToast } from '../hooks/useToast.jsx';
import { useAppConfig } from '../AppConfigContext';
import { fmt, scoreClass } from '../utils';
import './Predictions.css';

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

export default function Predictions() {
  const { voters } = useAppConfig();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modalId, setModalId] = useState(null);
  const { toast, Toast } = useToast();

  // Default to 2 voters (like the scoring rule threshold)
  const [minVoters, setMinVoters] = useState(2);
  const [minDirFilms, setMinDirFilms] = useState(2);

  const [search, setSearch] = useState('');
  const [verdictFilter, setVerdictFilter] = useState('all');
  const [sortKey, setSortKey] = useState('score-desc');

  useEffect(() => {
    setLoading(true);
    api.getPredictionAccuracy({ minVoters, minDirFilms })
      .then(res => setData(res))
      .catch(err => {
        console.error(err);
        toast('Failed to load prediction accuracy data');
      })
      .finally(() => setLoading(false));
  }, [minVoters, minDirFilms]);

  function handleSaved(updated) {
    if (!data) return;
    setData(prev => ({
      ...prev,
      films: prev.films.map(f => f.id === updated.id ? { ...f, ...updated } : f)
    }));
    toast('Saved');
  }

  function handleDeleted(id) {
    if (!data) return;
    setData(prev => ({
      ...prev,
      films: prev.films.filter(f => f.id !== id)
    }));
    toast('Deleted');
  }

  async function handleWatchlistToggle(id, nextWl) {
    if (!data) return;
    const target = data.films.find(f => f.id === id);
    const title = target?.title ? `"${target.title}"` : 'Film';
    setData(prev => ({
      ...prev,
      films: prev.films.map(f => f.id === id ? { ...f, watchlist: nextWl } : f)
    }));
    toast(nextWl ? `Added ${title} to Watchlist` : `Removed ${title} from Watchlist`);
    try {
      await api.updateMovie(id, { watchlist: nextWl });
    } catch (err) {
      console.error(err);
      setData(prev => ({
        ...prev,
        films: prev.films.map(f => f.id === id ? { ...f, watchlist: !nextWl } : f)
      }));
      toast(`Failed to update Watchlist for ${title}`);
    }
  }

  const filteredFilms = useMemo(() => {
    if (!data?.films) return [];
    let list = data.films.filter(f => {
      if (search) {
        const q = search.toLowerCase();
        if (!f.title.toLowerCase().includes(q) && !f.director?.toLowerCase().includes(q)) return false;
      }
      if (verdictFilter === 'bullseye') return f.absError <= 0.5;
      if (verdictFilter === 'surprise') return f.diff >= 1.0;
      if (verdictFilter === 'disappointment') return f.diff <= -1.0;
      if (verdictFilter === 'mn') return f.mn;
      return true;
    });

    switch (sortKey) {
      case 'score-desc':
        return list.sort((a, b) => b.actualScore - a.actualScore);
      case 'score-asc':
        return list.sort((a, b) => a.actualScore - b.actualScore);
      case 'prior-desc':
        return list.sort((a, b) => b.predictedPrior - a.predictedPrior);
      case 'error-asc':
        return list.sort((a, b) => a.absError - b.absError);
      case 'diff-desc':
        return list.sort((a, b) => b.diff - a.diff);
      case 'diff-asc':
        return list.sort((a, b) => a.diff - b.diff);
      default:
        return list;
    }
  }, [data, search, verdictFilter, sortKey]);

  const summary = data?.summary;

  return (
    <div>
      <Toast />

      {/* ── Subnav between Picks & Prediction Accuracy ── */}
      <div className="preds-subnav-bar">
        <div className="preds-nav-tabs">
          <NavLink to="/recommendations" className="preds-nav-tab">
            🎯 Picks (Recommendations)
          </NavLink>
          <NavLink to="/predictions" className="preds-nav-tab active">
            🔮 Prediction Accuracy & Backtest
          </NavLink>
        </div>

        <div className="preds-controls">
          <div className="preds-ctl-group">
            <span className="preds-ctl-label">Cohort:</span>
            <select
              className="select select-sm"
              value={minVoters}
              onChange={e => setMinVoters(Number(e.target.value))}
            >
              <option value={2}>≥ 2 voters (Scoring rule · All scored)</option>
              <option value={3}>≥ 3 voters (Core group)</option>
              <option value={4}>≥ 4 voters (Consensus)</option>
            </select>
          </div>

          <div className="preds-ctl-group">
            <span className="preds-ctl-label">Min Director Films:</span>
            <select
              className="select select-sm"
              value={minDirFilms}
              onChange={e => setMinDirFilms(Number(e.target.value))}
            >
              <option value={1}>≥ 1 film</option>
              <option value={2}>≥ 2 films (Standard)</option>
              <option value={3}>≥ 3 films</option>
            </select>
          </div>
        </div>
      </div>

      <div className="preds-page">
        {/* ── Header ── */}
        <div className="preds-header-row">
          <div className="preds-header-left">
            <h1 className="preds-title">
              <span>🔮 Prediction Accuracy & Retrospective</span>
            </h1>
            <p className="preds-sub">
              How closely did our Bayesian prior anticipate group enjoyment before screening?
              Evaluated on scored films using <strong>Leave-One-Out Cross-Validation</strong>.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="spinner" style={{ margin: '60px auto' }} />
        ) : !data ? (
          <p style={{ textAlign: 'center', color: 'var(--text2)', marginTop: 40 }}>
            Unable to load prediction retrospective data.
          </p>
        ) : (
          <>
            {/* ── Metric Summary Cards (KPIs) ── */}
            <div className="preds-kpis">
              <div className="preds-kpi-card">
                <div className="preds-kpi-header">
                  <span className="preds-kpi-title">Model MAE</span>
                  <span className="preds-kpi-icon">🎯</span>
                </div>
                <div className="preds-kpi-value">
                  ±{summary?.maeWithDir != null ? fmt(summary.maeWithDir) : fmt(summary?.mae)}
                </div>
                <div className="preds-kpi-sub">
                  Mean absolute error on films with director history (overall ±{fmt(summary?.mae)})
                </div>
              </div>

              <div className="preds-kpi-card">
                <div className="preds-kpi-header">
                  <span className="preds-kpi-title">Bullseye Rate</span>
                  <span className="preds-kpi-icon">🎯</span>
                </div>
                <div className="preds-kpi-value">{summary?.withinHalfPct}%</div>
                <div className="preds-kpi-sub">
                  {summary?.withinHalfCount} of {summary?.totalEvaluated} films predicted within ±0.5 pts
                </div>
                <div className="preds-progress-bar">
                  <div className="preds-progress-fill" style={{ width: `${summary?.withinHalfPct}%`, background: 'var(--green)' }} />
                </div>
              </div>

              <div className="preds-kpi-card">
                <div className="preds-kpi-header">
                  <span className="preds-kpi-title">In Ballpark</span>
                  <span className="preds-kpi-icon">📊</span>
                </div>
                <div className="preds-kpi-value">{summary?.withinOnePct}%</div>
                <div className="preds-kpi-sub">
                  {summary?.withinOneCount} of {summary?.totalEvaluated} films predicted within ±1.0 pt
                </div>
                <div className="preds-progress-bar">
                  <div className="preds-progress-fill" style={{ width: `${summary?.withinOnePct}%`, background: 'var(--accent)' }} />
                </div>
              </div>

              <div className="preds-kpi-card">
                <div className="preds-kpi-header">
                  <span className="preds-kpi-title">Tested Cohort</span>
                  <span className="preds-kpi-icon">🎬</span>
                </div>
                <div className="preds-kpi-value">{summary?.totalEvaluated}</div>
                <div className="preds-kpi-sub">
                  Films with ≥ {minVoters} voters ({summary?.directorTrackCount} with director track)
                </div>
              </div>
            </div>

            {/* ── Showcase Podiums (Top 10s with Dual Actual & Prior Rankings) ── */}
            <div className="preds-podiums-section">
              <h2 className="preds-section-title">
                <span>🏆 Model Highlights & Extremes (Top 10)</span>
              </h2>

              <div className="preds-podiums-grid">
                {/* 1. Bullseyes */}
                <div className="preds-podium-card podium-bullseye">
                  <div className="preds-podium-header">
                    <span className="preds-podium-title">🎯 Top Bullseyes</span>
                    <span className="preds-podium-badge">Spot-on (≤ ±0.5)</span>
                  </div>
                  <div className="preds-podium-list">
                    {data.topBullseyes?.slice(0, 10).map((f, i) => (
                      <div key={f.id} className="preds-podium-item" onClick={() => setModalId(f.id)} title="Click to view film details">
                        <div className="preds-podium-item-left">
                          <span className="preds-podium-rank">#{i + 1}</span>
                          <div className="preds-podium-meta">
                            <span className="preds-podium-film-title" title={f.title}>{f.title}</span>
                            <span className="preds-podium-film-sub">{f.director} ({f.year})</span>
                          </div>
                        </div>
                        <div className="preds-podium-scores">
                          <div className="preds-score-pair">
                            <div className="preds-score-line" title={`Actual Score: ${fmt(f.actualScore)} (Catalog Rank #${f.actualRank})`}>
                              <span className="preds-lbl">Act</span>
                              <strong className={`preds-val ${scoreClass(f.actualScore)}`}>{fmt(f.actualScore)}</strong>
                              <span className="preds-rank-chip" title="Catalog actual rank">#{f.actualRank}</span>
                            </div>
                            <div className="preds-score-line" title={`Prior Expectation: ${fmt(f.predictedPrior)} (Catalog Rank #${f.priorRank})`}>
                              <span className="preds-lbl">Pri</span>
                              <strong className="preds-val preds-val-prior">{fmt(f.predictedPrior)}</strong>
                              <span className="preds-rank-chip" title="Catalog prior rank">#{f.priorRank}</span>
                            </div>
                          </div>
                          <span className="preds-podium-diff diff-bullseye">
                            err: {fmt(f.absError)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 2. Pleasantly Surprised */}
                <div className="preds-podium-card podium-surprise">
                  <div className="preds-podium-header">
                    <span className="preds-podium-title">🌟 Pleasantly Surprised</span>
                    <span className="preds-podium-badge">Exceeded Prior</span>
                  </div>
                  <div className="preds-podium-list">
                    {data.topSurprises?.slice(0, 10).map((f, i) => (
                      <div key={f.id} className="preds-podium-item" onClick={() => setModalId(f.id)} title="Click to view film details">
                        <div className="preds-podium-item-left">
                          <span className="preds-podium-rank">#{i + 1}</span>
                          <div className="preds-podium-meta">
                            <span className="preds-podium-film-title" title={f.title}>{f.title}</span>
                            <span className="preds-podium-film-sub">{f.director} ({f.year})</span>
                          </div>
                        </div>
                        <div className="preds-podium-scores">
                          <div className="preds-score-pair">
                            <div className="preds-score-line" title={`Actual Score: ${fmt(f.actualScore)} (Catalog Rank #${f.actualRank})`}>
                              <span className="preds-lbl">Act</span>
                              <strong className={`preds-val ${scoreClass(f.actualScore)}`}>{fmt(f.actualScore)}</strong>
                              <span className="preds-rank-chip" title="Catalog actual rank">#{f.actualRank}</span>
                            </div>
                            <div className="preds-score-line" title={`Prior Expectation: ${fmt(f.predictedPrior)} (Catalog Rank #${f.priorRank})`}>
                              <span className="preds-lbl">Pri</span>
                              <strong className="preds-val preds-val-prior">{fmt(f.predictedPrior)}</strong>
                              <span className="preds-rank-chip" title="Catalog prior rank">#{f.priorRank}</span>
                            </div>
                          </div>
                          <span className="preds-podium-diff diff-over">
                            +{fmt(f.diff)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 3. Underperformed */}
                <div className="preds-podium-card podium-letdown">
                  <div className="preds-podium-header">
                    <span className="preds-podium-title">📉 Underperformed</span>
                    <span className="preds-podium-badge">Fell Short</span>
                  </div>
                  <div className="preds-podium-list">
                    {data.topDisappointments?.slice(0, 10).map((f, i) => (
                      <div key={f.id} className="preds-podium-item" onClick={() => setModalId(f.id)} title="Click to view film details">
                        <div className="preds-podium-item-left">
                          <span className="preds-podium-rank">#{i + 1}</span>
                          <div className="preds-podium-meta">
                            <span className="preds-podium-film-title" title={f.title}>{f.title}</span>
                            <span className="preds-podium-film-sub">{f.director} ({f.year})</span>
                          </div>
                        </div>
                        <div className="preds-podium-scores">
                          <div className="preds-score-pair">
                            <div className="preds-score-line" title={`Actual Score: ${fmt(f.actualScore)} (Catalog Rank #${f.actualRank})`}>
                              <span className="preds-lbl">Act</span>
                              <strong className={`preds-val ${scoreClass(f.actualScore)}`}>{fmt(f.actualScore)}</strong>
                              <span className="preds-rank-chip" title="Catalog actual rank">#{f.actualRank}</span>
                            </div>
                            <div className="preds-score-line" title={`Prior Expectation: ${fmt(f.predictedPrior)} (Catalog Rank #${f.priorRank})`}>
                              <span className="preds-lbl">Pri</span>
                              <strong className="preds-val preds-val-prior">{fmt(f.predictedPrior)}</strong>
                              <span className="preds-rank-chip" title="Catalog prior rank">#{f.priorRank}</span>
                            </div>
                          </div>
                          <span className="preds-podium-diff diff-under">
                            {fmt(f.diff)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Table Toolbar ── */}
            <div className="preds-toolbar">
              <div className="preds-search-box">
                <input
                  className="input search-input"
                  placeholder="Filter evaluated films…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
                {search && <button className="search-clear" onClick={() => setSearch('')}>✕</button>}
              </div>

              <div className="preds-verdicts">
                <button
                  type="button"
                  className={`preds-verdict-btn${verdictFilter === 'all' ? ' active' : ''}`}
                  onClick={() => setVerdictFilter('all')}
                >
                  All ({data.films?.length})
                </button>
                <button
                  type="button"
                  className={`preds-verdict-btn${verdictFilter === 'bullseye' ? ' active' : ''}`}
                  onClick={() => setVerdictFilter('bullseye')}
                >
                  🎯 Bullseyes (Spot-on)
                </button>
                <button
                  type="button"
                  className={`preds-verdict-btn${verdictFilter === 'surprise' ? ' active' : ''}`}
                  onClick={() => setVerdictFilter('surprise')}
                >
                  🌟 Pleasantly Surprised
                </button>
                <button
                  type="button"
                  className={`preds-verdict-btn${verdictFilter === 'disappointment' ? ' active' : ''}`}
                  onClick={() => setVerdictFilter('disappointment')}
                >
                  📉 Underperformed
                </button>
                <button
                  type="button"
                  className={`preds-verdict-btn${verdictFilter === 'mn' ? ' active' : ''}`}
                  onClick={() => setVerdictFilter('mn')}
                >
                  🎬 MN Only
                </button>
              </div>

              <select
                className="select select-sm preds-sort-select"
                value={sortKey}
                onChange={e => setSortKey(e.target.value)}
              >
                <option value="score-desc">Sort by Actual Score (High → Low)</option>
                <option value="score-asc">Sort by Actual Score (Low → High)</option>
                <option value="prior-desc">Sort by Predicted Prior (High → Low)</option>
                <option value="error-asc">Sort by Accuracy (Bullseyes first)</option>
                <option value="diff-desc">Sort by Outperformance (Biggest Surprises)</option>
                <option value="diff-asc">Sort by Underperformance (Biggest Drops)</option>
              </select>
            </div>

            {/* ── Table ── */}
            <div className="preds-table-wrapper">
              <table className="preds-table">
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>#</th>
                    <th>Film</th>
                    <th>Voters</th>
                    <th>Predicted Prior</th>
                    <th>Actual Score</th>
                    <th>Δ Delta</th>
                    <th>Verdict</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFilms.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--text2)' }}>
                        No films match the filter criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredFilms.map((f, idx) => (
                      <tr key={f.id} className="preds-tr-clickable" onClick={() => setModalId(f.id)}>
                        <td className="preds-cell-rank">#{idx + 1}</td>
                        <td className="preds-cell-film">
                          <div className="preds-film-title-row">
                            <span className="preds-film-title">{f.title}</span>
                            {f.mn && <span className="badge badge-mn">MN</span>}
                            <WatchlistBadge id={f.id} watchlist={f.watchlist} onToggle={handleWatchlistToggle} />
                            {f.imdb_rating != null && (
                              <span className="badge-imdb-pill">
                                <span className="imdb-logo">IMDb</span>
                                <span className="imdb-rating">{Number.isInteger(f.imdb_rating) ? f.imdb_rating : f.imdb_rating.toFixed(1)}</span>
                              </span>
                            )}
                          </div>
                          <div className="preds-film-sub">
                            {f.director}{f.year ? ` · ${f.year}` : ''}
                          </div>
                        </td>
                        <td className="preds-cell-voters">
                          <VoterPills ratings={f.ratings} voters={voters} />
                        </td>
                        <td className="preds-cell-prior">
                          <div className="preds-prior-wrap">
                            <div className="preds-prior-val-row">
                              <span className="preds-prior-val">{fmt(f.predictedPrior)}</span>
                              <span className="preds-rank-chip" title="Rank based on Prior expectation">#{f.priorRank}</span>
                            </div>
                            <div className="preds-prior-decomp">
                              {f.dirAvg != null && <span className="preds-decomp-pill" title="Director track avg">Dir {fmt(f.dirAvg)}</span>}
                              {f.decAvg != null && <span className="preds-decomp-pill" title="Decade era avg">Dec {fmt(f.decAvg)}</span>}
                              {f.haloBoost > 0 && <span className="preds-decomp-pill" title="Top 10 catalog halo boost">+{fmt(f.haloBoost)}</span>}
                            </div>
                          </div>
                        </td>
                        <td className="preds-cell-score">
                          <div className="preds-score-with-rank">
                            <strong className={scoreClass(f.actualScore)}>{fmt(f.actualScore)}</strong>
                            <span className="preds-rank-chip" title="Rank based on Actual score">#{f.actualRank}</span>
                          </div>
                        </td>
                        <td>
                          <span className={`preds-diff-pill ${f.absError <= 0.5 ? 'diff-bullseye' : f.diff > 0 ? 'diff-over' : 'diff-under'}`}>
                            {f.diff > 0 ? `+${fmt(f.diff)}` : fmt(f.diff)}
                          </span>
                        </td>
                        <td>
                          <span className={`preds-verdict-badge verdict-${f.verdict}`}>
                            {f.verdictLabel}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
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
