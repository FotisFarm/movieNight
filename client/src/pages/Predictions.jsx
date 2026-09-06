import { useState, useEffect, useMemo } from 'react';
import { NavLink } from 'react-router-dom';
import { api } from '../api';
import MovieModal from '../components/MovieModal';
import PredictionModal from '../components/PredictionModal';
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
  const [activeFilm, setActiveFilm] = useState(null); // Selected film for PredictionModal
  const [movieModalId, setMovieModalId] = useState(null); // Optional full movie modal
  const { toast, Toast } = useToast();

  // Voter threshold: 2+ is the scoring rule default
  const [minVoters, setMinVoters] = useState(2);
  const [minDirFilms, setMinDirFilms] = useState(2);

  // Responsive Highlights Tab (bullseye | surprise | letdown)
  const [activeTab, setActiveTab] = useState('bullseye');

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
    <div className="preds-page">
      <Toast />

      {/* ── Subnav between Picks & Prediction Accuracy ── */}
      <div className="preds-subnav-bar">
        <div className="preds-nav-tabs">
          <NavLink to="/recommendations" className="preds-nav-tab">
            🎯 Picks
          </NavLink>
          <NavLink to="/predictions" className="preds-nav-tab active">
            🔮 Accuracy
          </NavLink>
        </div>

        <div className="preds-controls">
          <div className="preds-ctl-group">
            <span className="preds-ctl-label">Min Ratings:</span>
            <select
              className="select select-sm"
              value={minVoters}
              onChange={e => setMinVoters(Number(e.target.value))}
            >
              <option value={2}>2+ (All scored)</option>
              <option value={3}>3+ votes</option>
              <option value={4}>4+ votes</option>
            </select>
          </div>

          <div className="preds-ctl-group">
            <span className="preds-ctl-label">Dir History:</span>
            <select
              className="select select-sm"
              value={minDirFilms}
              onChange={e => setMinDirFilms(Number(e.target.value))}
            >
              <option value={1}>1+ film</option>
              <option value={2}>2+ films</option>
              <option value={3}>3+ films</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── Header Area ── */}
      <div className="preds-header-row">
        <h1 className="preds-title">
          <span>🔮 Prediction Accuracy</span>
        </h1>
        <p className="preds-sub">
          How well did our predictions anticipate actual ratings? Tested on every scored film before it was watched.
        </p>
      </div>

      {loading ? (
        <div className="spinner" style={{ margin: '60px auto' }} />
      ) : !data ? (
        <p style={{ textAlign: 'center', color: 'var(--text2)', marginTop: 40 }}>
          Unable to load accuracy data.
        </p>
      ) : (
        <>
          {/* ── Compact Metric Tiles ── */}
          <div className="preds-kpis">
            <div className="preds-kpi-tile">
              <div className="preds-kpi-top">
                <span>Avg Miss</span>
                <span>🎯</span>
              </div>
              <div className="preds-kpi-val">
                ±{summary?.maeWithDir != null ? fmt(summary.maeWithDir) : fmt(summary?.mae)}
              </div>
              <div className="preds-kpi-sub">
                Director track (overall ±{fmt(summary?.mae)})
              </div>
            </div>

            <div className="preds-kpi-tile">
              <div className="preds-kpi-top">
                <span>Spot-On (±0.5)</span>
                <span>🎯</span>
              </div>
              <div className="preds-kpi-val">{summary?.withinHalfPct}%</div>
              <div className="preds-kpi-sub">
                {summary?.withinHalfCount} of {summary?.totalEvaluated} films
              </div>
            </div>

            <div className="preds-kpi-tile">
              <div className="preds-kpi-top">
                <span>In Ballpark (±1.0)</span>
                <span>📊</span>
              </div>
              <div className="preds-kpi-val">{summary?.withinOnePct}%</div>
              <div className="preds-kpi-sub">
                {summary?.withinOneCount} of {summary?.totalEvaluated} films
              </div>
            </div>

            <div className="preds-kpi-tile">
              <div className="preds-kpi-top">
                <span>Films Tested</span>
                <span>🎬</span>
              </div>
              <div className="preds-kpi-val">{summary?.totalEvaluated}</div>
              <div className="preds-kpi-sub">
                ≥ {minVoters} ratings ({summary?.directorTrackCount} with dir history)
              </div>
            </div>
          </div>

          {/* ── Top 10 Highlights & Extremes (Minimal info: Pred, Act, Diff) ── */}
          <div className="preds-highlights-section">
            <div className="preds-highlights-header">
              <h2 className="preds-section-title">
                <span>🏆 Top 10 Highlights</span>
              </h2>

              {/* Mobile / Tablet category switcher */}
              <div className="preds-mobile-tabs">
                <button
                  type="button"
                  className={`preds-m-tab-btn${activeTab === 'bullseye' ? ' active' : ''}`}
                  onClick={() => setActiveTab('bullseye')}
                >
                  🎯 Spot-On
                </button>
                <button
                  type="button"
                  className={`preds-m-tab-btn${activeTab === 'surprise' ? ' active' : ''}`}
                  onClick={() => setActiveTab('surprise')}
                >
                  🌟 Surprises
                </button>
                <button
                  type="button"
                  className={`preds-m-tab-btn${activeTab === 'letdown' ? ' active' : ''}`}
                  onClick={() => setActiveTab('letdown')}
                >
                  📉 Underperformed
                </button>
              </div>
            </div>

            {/* Responsive grid: on desktop all 3 are visible, on mobile only activeTab is visible */}
            <div className="preds-podiums-grid">
              {/* 1. Bullseyes */}
              <div className={`preds-podium-card podium-bullseye ${activeTab === 'bullseye' ? 'is-active' : ''}`}>
                <div className="preds-podium-card-header">
                  <span className="preds-podium-card-title">🎯 Top Bullseyes</span>
                  <span className="preds-podium-badge">Spot-on (≤ ±0.5)</span>
                </div>
                <div className="preds-podium-list">
                  {data.topBullseyes?.slice(0, 10).map((f, i) => (
                    <div
                      key={f.id}
                      className="preds-podium-item"
                      onClick={() => setActiveFilm(f)}
                      title="Click to view prediction calculation details"
                    >
                      <div className="preds-podium-item-left">
                        <span className="preds-podium-rank">#{i + 1}</span>
                        <div className="preds-podium-meta">
                          <span className="preds-podium-film-title" title={f.title}>{f.title}</span>
                          <span className="preds-podium-film-sub">{f.director} ({f.year})</span>
                        </div>
                      </div>
                      <div className="preds-podium-scores">
                        <div className="preds-score-pair">
                          <div className="preds-score-line">
                            <span className="preds-lbl">Actual</span>
                            <strong className={`preds-val ${scoreClass(f.actualScore)}`}>{fmt(f.actualScore)}</strong>
                          </div>
                          <div className="preds-score-line">
                            <span className="preds-lbl">Expected</span>
                            <strong className="preds-val preds-val-prior">{fmt(f.predictedPrior)}</strong>
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
              <div className={`preds-podium-card podium-surprise ${activeTab === 'surprise' ? 'is-active' : ''}`}>
                <div className="preds-podium-card-header">
                  <span className="preds-podium-card-title">🌟 Pleasantly Surprised</span>
                  <span className="preds-podium-badge">Beat Prediction</span>
                </div>
                <div className="preds-podium-list">
                  {data.topSurprises?.slice(0, 10).map((f, i) => (
                    <div
                      key={f.id}
                      className="preds-podium-item"
                      onClick={() => setActiveFilm(f)}
                      title="Click to view prediction calculation details"
                    >
                      <div className="preds-podium-item-left">
                        <span className="preds-podium-rank">#{i + 1}</span>
                        <div className="preds-podium-meta">
                          <span className="preds-podium-film-title" title={f.title}>{f.title}</span>
                          <span className="preds-podium-film-sub">{f.director} ({f.year})</span>
                        </div>
                      </div>
                      <div className="preds-podium-scores">
                        <div className="preds-score-pair">
                          <div className="preds-score-line">
                            <span className="preds-lbl">Actual</span>
                            <strong className={`preds-val ${scoreClass(f.actualScore)}`}>{fmt(f.actualScore)}</strong>
                          </div>
                          <div className="preds-score-line">
                            <span className="preds-lbl">Expected</span>
                            <strong className="preds-val preds-val-prior">{fmt(f.predictedPrior)}</strong>
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
              <div className={`preds-podium-card podium-letdown ${activeTab === 'letdown' ? 'is-active' : ''}`}>
                <div className="preds-podium-card-header">
                  <span className="preds-podium-card-title">📉 Underperformed</span>
                  <span className="preds-podium-badge">Fell Short</span>
                </div>
                <div className="preds-podium-list">
                  {data.topDisappointments?.slice(0, 10).map((f, i) => (
                    <div
                      key={f.id}
                      className="preds-podium-item"
                      onClick={() => setActiveFilm(f)}
                      title="Click to view prediction calculation details"
                    >
                      <div className="preds-podium-item-left">
                        <span className="preds-podium-rank">#{i + 1}</span>
                        <div className="preds-podium-meta">
                          <span className="preds-podium-film-title" title={f.title}>{f.title}</span>
                          <span className="preds-podium-film-sub">{f.director} ({f.year})</span>
                        </div>
                      </div>
                      <div className="preds-podium-scores">
                        <div className="preds-score-pair">
                          <div className="preds-score-line">
                            <span className="preds-lbl">Actual</span>
                            <strong className={`preds-val ${scoreClass(f.actualScore)}`}>{fmt(f.actualScore)}</strong>
                          </div>
                          <div className="preds-score-line">
                            <span className="preds-lbl">Expected</span>
                            <strong className="preds-val preds-val-prior">{fmt(f.predictedPrior)}</strong>
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

          {/* ── All Tested Films Directory ── */}
          <div className="preds-toolbar">
            <div className="preds-search-box">
              <input
                className="input search-input"
                placeholder="Search tested films…"
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
                🎯 Spot-On
              </button>
              <button
                type="button"
                className={`preds-verdict-btn${verdictFilter === 'surprise' ? ' active' : ''}`}
                onClick={() => setVerdictFilter('surprise')}
              >
                🌟 Surprises
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
              <option value="score-desc">Sort: Best Actual Score</option>
              <option value="score-asc">Sort: Lowest Actual Score</option>
              <option value="prior-desc">Sort: Highest Predicted</option>
              <option value="error-asc">Sort: Most Accurate (Bullseyes)</option>
              <option value="diff-desc">Sort: Outperformed (Surprises)</option>
              <option value="diff-asc">Sort: Underperformed (Drops)</option>
            </select>
          </div>

          {/* Desktop Table View (>= 768px) - Minimal Info */}
          <div className="preds-table-wrapper preds-desktop-only">
            <table className="preds-table">
              <thead>
                <tr>
                  <th style={{ width: 36 }}>#</th>
                  <th>Film</th>
                  <th>Votes</th>
                  <th>Predicted</th>
                  <th>Actual</th>
                  <th>Difference</th>
                  <th>Verdict</th>
                </tr>
              </thead>
              <tbody>
                {filteredFilms.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--text2)' }}>
                      No films match the filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredFilms.map((f, idx) => (
                    <tr key={f.id} className="preds-tr-clickable" onClick={() => setActiveFilm(f)}>
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
                      <td>
                        <VoterPills ratings={f.ratings} voters={voters} />
                      </td>
                      <td>
                        <span className="preds-table-val preds-val-prior">{fmt(f.predictedPrior)}</span>
                      </td>
                      <td>
                        <strong className={`preds-table-val ${scoreClass(f.actualScore)}`}>{fmt(f.actualScore)}</strong>
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

          {/* Mobile Card List (< 768px) - Minimal Info */}
          <div className="preds-mobile-cards preds-mobile-only">
            {filteredFilms.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text2)' }}>
                No films match the filter criteria.
              </div>
            ) : (
              filteredFilms.map((f, idx) => (
                <div key={f.id} className="preds-m-card" onClick={() => setActiveFilm(f)}>
                  <div className="preds-m-top">
                    <span className="preds-m-rank">#{idx + 1}</span>
                    <div className="preds-m-title-block">
                      <div className="preds-m-title-row">
                        <span className="preds-m-title">{f.title}</span>
                        {f.mn && <span className="badge badge-mn">MN</span>}
                        <WatchlistBadge id={f.id} watchlist={f.watchlist} onToggle={handleWatchlistToggle} />
                      </div>
                      <span className="preds-m-sub">{f.director}{f.year ? ` · ${f.year}` : ''}</span>
                    </div>
                    <div className="preds-m-scores-box">
                      <div className="preds-m-score-row">
                        <span className="preds-m-lbl">Actual</span>
                        <strong className={`preds-val ${scoreClass(f.actualScore)}`}>{fmt(f.actualScore)}</strong>
                      </div>
                      <div className="preds-m-score-row">
                        <span className="preds-m-lbl">Predicted</span>
                        <span className="preds-m-prior">{fmt(f.predictedPrior)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="preds-m-bottom">
                    <div className="preds-m-verdicts">
                      <span className={`preds-diff-pill ${f.absError <= 0.5 ? 'diff-bullseye' : f.diff > 0 ? 'diff-over' : 'diff-under'}`}>
                        {f.diff > 0 ? `+${fmt(f.diff)}` : fmt(f.diff)}
                      </span>
                      <span className={`preds-verdict-badge verdict-${f.verdict}`}>
                        {f.verdictLabel}
                      </span>
                    </div>
                    <VoterPills ratings={f.ratings} voters={voters} />
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {/* ── Detailed Prediction Modal ── */}
      {activeFilm && (
        <PredictionModal
          film={activeFilm}
          voters={voters}
          onClose={() => setActiveFilm(null)}
          onToggleWatchlist={handleWatchlistToggle}
          onOpenFullMovie={id => setMovieModalId(id)}
        />
      )}

      {/* ── Standard MovieModal for editing / comments (if requested) ── */}
      {movieModalId && (
        <MovieModal
          movieId={movieModalId}
          onClose={() => setMovieModalId(null)}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  );
}
