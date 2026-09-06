import { useEffect } from 'react';
import { fmt, scoreClass, posterUrl } from '../utils';
import WatchlistBadge from './WatchlistBadge';
import LetterboxdPill from './LetterboxdPill';
import './PredictionModal.css';

export default function PredictionModal({ film, voters = [], onClose, onToggleWatchlist, onOpenFullMovie }) {
  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!film) return null;

  const poster = film.poster_path ? posterUrl(film.poster_path, 'w92') : null;

  // Narrative explanation of difference
  let narrative = '';
  if (film.absError <= 0.5) {
    narrative = `Spot-on prediction! The group scored this film ${fmt(film.actualScore)}, landing within ${fmt(film.absError)} pts of the model's ${fmt(film.predictedPrior)} expectation.`;
  } else if (film.diff >= 1.0) {
    narrative = `Pleasantly surprised! The group loved this film far more than historical averages suggested, scoring it +${fmt(film.diff)} pts above expectation.`;
  } else if (film.diff <= -1.0) {
    narrative = `Fell short of expectations. Despite strong historical averages, the group scored this film ${fmt(film.diff)} pts below what the model anticipated.`;
  } else if (film.diff > 0) {
    narrative = `Beat expectation by +${fmt(film.diff)} pts, landing slightly above the model's anticipated ballpark.`;
  } else {
    narrative = `Missed expectation by ${fmt(film.diff)} pts, landing slightly below the anticipated ballpark.`;
  }

  const activeTotal = (film.activeWeights?.total) || (
    (film.dirAvg != null ? (film.activeWeights?.dw ?? 0.35) : 0) +
    (film.letterboxd_rating != null ? (film.activeWeights?.lbw ?? 0.40) : 0) +
    (film.decAvg != null ? (film.activeWeights?.ew ?? 0.25) : 0)
  ) || 1;

  const wDir = film.dirAvg != null ? Math.round(((film.activeWeights?.dw ?? 0.35) / activeTotal) * 100) : 0;
  const wLb  = film.letterboxd_rating != null ? Math.round(((film.activeWeights?.lbw ?? 0.40) / activeTotal) * 100) : 0;
  const wEra = Math.max(0, 100 - wDir - wLb);

  return (
    <div className="pred-modal-overlay" onClick={onClose}>
      <div className="pred-modal" onClick={e => e.stopPropagation()}>
        {/* ── Modal Header ── */}
        <div className="pred-modal-header">
          <div className="pred-modal-header-left">
            {poster ? (
              <img src={poster} alt={film.title} className="pred-modal-poster" />
            ) : (
              <div className="pred-modal-poster-placeholder">🎬</div>
            )}
            <div className="pred-modal-title-block">
              <div className="pred-modal-title-row">
                <span className="pred-modal-title">{film.title}</span>
                {film.mn && <span className="badge badge-mn">MN</span>}
                {onToggleWatchlist && (
                  <WatchlistBadge id={film.id} watchlist={film.watchlist} onToggle={onToggleWatchlist} />
                )}
                {(film.imdb_id || film.letterboxd_rating != null) && (
                  <LetterboxdPill imdbId={film.imdb_id} score={film.letterboxd_rating} />
                )}
              </div>
              <div className="pred-modal-sub">
                {film.director}{film.year ? ` · ${film.year}` : ''}
              </div>
            </div>
          </div>
          <button className="pred-modal-close" onClick={onClose} title="Close">✕</button>
        </div>

        {/* ── Modal Body ── */}
        <div className="pred-modal-body">
          {/* Hero Matchup Banner */}
          <div className="pred-hero-card">
            <div className="pred-hero-matchup">
              <div className="pred-hero-box">
                <span className="pred-hero-lbl">Predicted</span>
                <span className="pred-hero-score">{fmt(film.predictedPrior)}</span>
              </div>

              <div className="pred-hero-center">
                <span className={`pred-diff-pill-lg ${film.absError <= 0.5 ? 'diff-bullseye' : film.diff > 0 ? 'diff-over' : 'diff-under'}`}>
                  {film.diff > 0 ? `+${fmt(film.diff)}` : fmt(film.diff)}
                </span>
                <span className="pred-hero-verdict">{film.verdictLabel}</span>
              </div>

              <div className="pred-hero-box actual">
                <span className="pred-hero-lbl">Actual</span>
                <span className={`pred-hero-score ${scoreClass(film.actualScore)}`}>{fmt(film.actualScore)}</span>
              </div>
            </div>

            <div className="pred-hero-narrative">
              {narrative}
            </div>
          </div>

          {/* 📐 Prediction Calculation Breakdown */}
          <div className="pred-calc-section">
            <div className="pred-section-label">
              <span>📐 How Predicted Score Was Calculated</span>
            </div>

            <div className="pred-calc-cards">
              {/* Director Track */}
              <div className="pred-calc-card">
                <div className="pred-calc-card-header">
                  <span className="pred-calc-title">Director Track</span>
                  <span className="pred-calc-weight">{film.dirAvg != null ? `${wDir}%` : 'N/A'}</span>
                </div>
                <div className="pred-calc-val">
                  {film.dirAvg != null ? fmt(film.dirAvg) : '–'}
                </div>
                <div className="pred-calc-sub">
                  {film.dirAvg != null
                    ? `Avg of ${film.otherDirFilmsCount || 1} other film(s) by ${film.director}`
                    : `No prior films by ${film.director}; used Letterboxd & era baseline`}
                </div>
                {film.dirAvg != null && (
                  <div className="pred-calc-contrib">
                    Contribution: +{fmt(film.dirAvg * (wDir / 100))} pts
                  </div>
                )}
              </div>

              {/* Letterboxd Consensus */}
              <div className="pred-calc-card">
                <div className="pred-calc-card-header">
                  <span className="pred-calc-title">Letterboxd Consensus</span>
                  <span className="pred-calc-weight">{film.letterboxd_rating != null ? `${wLb}%` : 'N/A'}</span>
                </div>
                <div className="pred-calc-val">
                  {film.letterboxd_rating != null ? `${Number(film.letterboxd_rating).toFixed(1)} ★ (${fmt(film.letterboxd_rating * 2)}/10)` : '–'}
                </div>
                <div className="pred-calc-sub">
                  {film.letterboxd_rating != null
                    ? `Global community score scaled to 10-point prior base`
                    : `No Letterboxd score; redistributed to Director & Era`}
                </div>
                {film.letterboxd_rating != null && (
                  <div className="pred-calc-contrib">
                    Contribution: +{fmt((film.letterboxd_rating * 2) * (wLb / 100))} pts
                  </div>
                )}
              </div>

              {/* Decade Era */}
              <div className="pred-calc-card">
                <div className="pred-calc-card-header">
                  <span className="pred-calc-title">Decade Era</span>
                  <span className="pred-calc-weight">{film.decAvg != null ? `${wEra}%` : 'N/A'}</span>
                </div>
                <div className="pred-calc-val">
                  {film.decAvg != null ? fmt(film.decAvg) : '–'}
                </div>
                <div className="pred-calc-sub">
                  {film.decAvg != null
                    ? `Avg of all ${film.decade || Math.floor(film.year / 10) * 10}s films scored by group`
                    : 'No decade data'}
                </div>
                {film.decAvg != null && (
                  <div className="pred-calc-contrib">
                    Contribution: +{fmt(film.decAvg * (wEra / 100))} pts
                  </div>
                )}
              </div>

              {/* Top 10 Halo Boost */}
              <div className="pred-calc-card">
                <div className="pred-calc-card-header">
                  <span className="pred-calc-title">Top 10 Boost</span>
                  <span className="pred-calc-weight">Bonus</span>
                </div>
                <div className="pred-calc-val">
                  {film.haloBoost > 0 ? `+${fmt(film.haloBoost)}` : '+0,00'}
                </div>
                <div className="pred-calc-sub">
                  {film.haloBoost > 0
                    ? `Director halo boost from voter Top 10 lists`
                    : 'Director has no other films in Top 10 picks'}
                </div>
              </div>
            </div>

            <div className="pred-formula-bar">
              <span className="pred-formula-math">
                {(() => {
                  const parts = [];
                  if (film.dirAvg != null && wDir > 0) parts.push(`(${fmt(film.dirAvg)} Dir × ${wDir}%)`);
                  if (film.letterboxd_rating != null && wLb > 0) parts.push(`(${fmt(film.letterboxd_rating * 2)} LB × ${wLb}%)`);
                  if (film.decAvg != null && wEra > 0) parts.push(`(${fmt(film.decAvg)} Era × ${wEra}%)`);
                  let s = parts.join(' + ') || 'Baseline';
                  if (film.haloBoost > 0) s += ` + ${fmt(film.haloBoost)} boost`;
                  return s;
                })()}
              </span>
              <span className="pred-formula-result">
                = {fmt(film.predictedPrior)} Predicted
              </span>
            </div>
          </div>

          {/* 👥 Group Verdict & Scores */}
          <div className="pred-votes-section">
            <div className="pred-section-label">
              <span>👥 Group Ratings ({film.voterCount} voters)</span>
            </div>

            <div className="pred-votes-list">
              {voters.map(v => {
                const s = film.ratings?.[v];
                if (s == null) return null;
                return (
                  <div key={v} className="pred-vote-chip">
                    <span className="pred-vote-name">{v}</span>
                    <span className={`pred-vote-score ${scoreClass(s)}`}>{Number.isInteger(s) ? s : s.toFixed(1)}</span>
                  </div>
                );
              })}
            </div>

            <div className="pred-votes-summary">
              Combined vote average: <strong>{fmt(film.actualScore - (film.topBonus || 0))}</strong>
              {film.topBonus > 0 && <span> + <strong>{fmt(film.topBonus)}</strong> Top 10 token bonus</span>}
              {' '}➔ Final Score: <strong className={scoreClass(film.actualScore)}>{fmt(film.actualScore)}</strong>
            </div>
          </div>
        </div>

        {/* ── Modal Footer ── */}
        <div className="pred-modal-footer">
          <div className="pred-modal-footer-left">
            {onOpenFullMovie && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  onClose();
                  onOpenFullMovie(film.id);
                }}
              >
                Open Full Movie Details ↗
              </button>
            )}
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
