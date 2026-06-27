const express = require('express');
const db = require('../db');
const { rankBonus } = require('../scoring');

const router = express.Router();
const GROUP_SIZE = 5;
const VOTERS = ['Μητσέας', 'Παντελής', 'Στέλιας', 'Φώτης', 'Λεόντιος'];

router.get('/', (req, res) => {
  // Parse and normalise bias weights from query params (default 0.45 / 0.45 / 0.1)
  let dw = Math.max(0, parseFloat(req.query.dw) || 0.45);
  let ew = Math.max(0, parseFloat(req.query.ew) || 0.45);
  let tw = Math.max(0, parseFloat(req.query.tw) || 0.10);
  const total = dw + ew + tw || 1;
  dw /= total; ew /= total; tw /= total;
  const _mv = req.query.maxVoters !== undefined ? parseInt(req.query.maxVoters) : 2;
  const maxVoters = Math.min(4, Math.max(0, isNaN(_mv) ? 2 : _mv));

  const allMovies  = db.prepare('SELECT * FROM movies').all();
  const allRatings = db.prepare('SELECT movie_id, voter, score FROM ratings').all();
  const allTop3    = db.prepare('SELECT movie_id, voter, rank FROM top3').all();

  // Index ratings and top3 by movie_id
  const ratingsByMovie = {};
  for (const r of allRatings) {
    if (!ratingsByMovie[r.movie_id]) ratingsByMovie[r.movie_id] = [];
    ratingsByMovie[r.movie_id].push(r);
  }
  const top3ByMovie = {};
  for (const t of allTop3) {
    if (!top3ByMovie[t.movie_id]) top3ByMovie[t.movie_id] = [];
    top3ByMovie[t.movie_id].push(t.rank);
  }

  // Compute fairBoosted for a movie (returns null if < 2 voters)
  function computeFairBoosted(movieId) {
    const rs = ratingsByMovie[movieId] || [];
    if (rs.length < 2) return null;
    const sum   = rs.reduce((a, r) => a + r.score, 0);
    const fair  = sum / rs.length;
    const boost = (top3ByMovie[movieId] || []).reduce((a, rank) => a + rankBonus(rank), 0);
    return Math.min(10, fair + boost);
  }

  // Build director and decade averages from fully-eligible rated films (≥2 voters)
  const dirScores    = {};  // director → [fairBoosted]
  const decadeScores = {};  // decade   → [fairBoosted]
  const top10WeightByDirector = {};  // director → Σ rankBonus(rank), rank-weighted pick strength

  for (const m of allMovies) {
    const fb = computeFairBoosted(m.id);
    if (fb !== null && m.director) {
      (dirScores[m.director] = dirScores[m.director] || []).push(fb);
    }
    if (fb !== null && m.year) {
      const decade = Math.floor(parseInt(m.year) / 10) * 10;
      if (!isNaN(decade)) (decadeScores[decade] = decadeScores[decade] || []).push(fb);
    }
  }
  for (const t of allTop3) {
    const m = allMovies.find(x => x.id === t.movie_id);
    if (m?.director) top10WeightByDirector[m.director] = (top10WeightByDirector[m.director] || 0) + rankBonus(t.rank);
  }

  function avg(arr) {
    if (!arr?.length) return null;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  // Score all non-fully-rated films
  const candidates = allMovies.filter(m => (ratingsByMovie[m.id] || []).length <= maxVoters);

  const results = candidates.map(m => {
    const ratingRows = ratingsByMovie[m.id] || [];
    const voterCount = ratingRows.length;

    // Ratings map for voter pills
    const ratingsMap = {};
    for (const r of ratingRows) ratingsMap[r.voter] = r.score;

    // Actual score (only if ≥2 voters)
    const actualScore = computeFairBoosted(m.id);

    // Prior components
    const decade     = m.year ? Math.floor(parseInt(m.year) / 10) * 10 : null;
    const dirAvg     = avg(dirScores[m.director]) ?? null;
    const decAvg     = (decade && !isNaN(decade)) ? avg(decadeScores[decade]) ?? null : null;
    const top10Weight = top10WeightByDirector[m.director] || 0;
    const top10Bonus  = Math.min(5.0, top10Weight);  // rank-weighted (Σ rankBonus), cap 5

    // Prior: weighted blend of director avg + decade avg + top3 bonus
    let prior = null;
    if (dirAvg !== null && decAvg !== null) {
      prior = dirAvg * dw + decAvg * ew + top10Bonus * tw;
    } else if (dirAvg !== null) {
      // No decade data — redistribute decade weight between director and top3
      const dwOnly = dw + ew * 0.5, twOnly = tw + ew * 0.5;
      const tOnly = dwOnly + twOnly;
      prior = dirAvg * (dwOnly / tOnly) + top10Bonus * (twOnly / tOnly);
    } else if (decAvg !== null) {
      const ewOnly = ew + dw * 0.5, twOnly = tw + dw * 0.5;
      const tOnly = ewOnly + twOnly;
      prior = decAvg * (ewOnly / tOnly) + top10Bonus * (twOnly / tOnly);
    }

    // Bayesian blend: trust actual score more as voterCount grows
    let predictedScore = null;
    if (actualScore !== null && prior !== null) {
      const confidence = voterCount / GROUP_SIZE;
      predictedScore = confidence * actualScore + (1 - confidence) * prior;
    } else if (actualScore !== null) {
      // Have real score but no prior — trust the actual score
      const confidence = voterCount / GROUP_SIZE;
      predictedScore = confidence * actualScore;
    } else if (prior !== null) {
      // No real score — use prior only
      predictedScore = prior;
    }

    if (predictedScore !== null) predictedScore = Math.round(Math.min(10, predictedScore) * 100) / 100;

    // Human-readable explanation
    const parts = [];
    if (dirAvg !== null) parts.push(`${m.director} avg ${dirAvg.toFixed(1)}`);
    if (decAvg !== null && decade) parts.push(`${decade}s avg ${decAvg.toFixed(1)}`);
    if (top10Weight > 0) parts.push(`top-pick boost +${top10Bonus.toFixed(1)}`);
    if (actualScore !== null) parts.push(`${voterCount} vote${voterCount > 1 ? 's' : ''} so far`);
    const explanation = parts.join(' · ') || null;

    return {
      id: m.id,
      title: m.title,
      director: m.director,
      year: m.year,
      mn: m.mn === 1,
      watchlist: m.watchlist === 1,
      voterCount,
      ratings: ratingsMap,
      actualScore: actualScore !== null ? Math.round(actualScore * 100) / 100 : null,
      predictedScore,
      dirAvg:  dirAvg  !== null ? Math.round(dirAvg  * 100) / 100 : null,
      decAvg:  decAvg  !== null ? Math.round(decAvg  * 100) / 100 : null,
      decade,
      top10Bonus: Math.round(top10Bonus * 100) / 100,
      explanation,
    };
  });

  results.sort((a, b) => {
    if (a.predictedScore === null && b.predictedScore === null) return 0;
    if (a.predictedScore === null) return 1;
    if (b.predictedScore === null) return -1;
    return b.predictedScore - a.predictedScore;
  });

  res.json(results.slice(0, 200));
});

module.exports = router;
