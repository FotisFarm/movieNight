const express = require('express');
const db = require('../db');
const { rankBonus } = require('../scoring');
const ah = require('../asyncHandler');

const router = express.Router();
const { GROUP_SIZE } = require('../config');

router.get('/', ah(async (req, res) => {
  // Parse bias weights from query params (default 0.45 / 0.45 / 0.10)
  const rawDw = Math.max(0, parseFloat(req.query.dw) ?? 0.45);
  const rawEw = Math.max(0, parseFloat(req.query.ew) ?? 0.45);
  const rawTw = Math.max(0, parseFloat(req.query.tw) ?? 0.10);

  // Normalise baseline weights between Director and Era
  const baseWeightTotal = rawDw + rawEw;
  const dw = baseWeightTotal > 0 ? rawDw / baseWeightTotal : 0.5;
  const ew = baseWeightTotal > 0 ? rawEw / baseWeightTotal : 0.5;

  // Top 10 scaling rate (responsive to tw slider, where default 0.10 => 0.15 rate)
  const twRate = rawTw > 0 ? 0.15 * (rawTw / 0.10) : 0;

  const _mv = req.query.maxVoters !== undefined ? parseInt(req.query.maxVoters) : 2;
  const maxVoters = Math.min(4, Math.max(0, isNaN(_mv) ? 2 : _mv));
  const minDirFilms = Math.max(1, parseInt(req.query.minDirFilms) || 2);

  // Independent full-table reads — concurrent, so this costs one round trip.
  const [allMovies, allRatings, allTop3] = await Promise.all([
    db.all('SELECT * FROM movies'),
    db.all('SELECT movie_id, voter, score FROM ratings'),
    db.all('SELECT movie_id, voter, rank FROM top3'),
  ]);
  const movieById  = new Map(allMovies.map(m => [m.id, m]));

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
  const dirScores      = {};  // director → [fairBoosted]
  const decadeScores   = {};  // decade   → [fairBoosted]
  const top3ByDirector = {};  // director → [top3 rows]

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
    const m = movieById.get(t.movie_id);
    if (m?.director) {
      (top3ByDirector[m.director] = top3ByDirector[m.director] || []).push(t);
    }
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
    const dirVals    = dirScores[m.director];
    const dirAvg     = (dirVals && dirVals.length >= minDirFilms) ? avg(dirVals) : null;
    const decAvg     = (decade && !isNaN(decade)) ? avg(decadeScores[decade]) ?? null : null;

    // Base prior from Director track record and Era average
    let base = null;
    if (dirAvg !== null && decAvg !== null) {
      base = dirAvg * dw + decAvg * ew;
    } else if (dirAvg !== null) {
      base = dirAvg;
    } else if (decAvg !== null) {
      base = decAvg;
    }

    // Top 10 Halo Boost with Catalog Breadth Multiplier:
    // If movie has an actualScore (>=2 votes), exclude this movie's own picks from prior
    // to avoid double-counting (actualScore already includes this movie's own top-10 boost).
    // If movie has <2 votes (actualScore is null), include all picks for this director.
    const picksForPrior = actualScore !== null
      ? (top3ByDirector[m.director] || []).filter(t => t.movie_id !== m.id)
      : (top3ByDirector[m.director] || []);

    const priorPoints = picksForPrior.reduce((acc, t) => acc + rankBonus(t.rank), 0);
    const priorUniqueFilms = new Set(picksForPrior.map(t => t.movie_id)).size;

    let haloBoost = 0;
    if (priorPoints > 0 && twRate > 0) {
      const breadthMultiplier = 1.0 + 0.20 * Math.max(0, priorUniqueFilms - 1);
      haloBoost = Math.min(0.75, priorPoints * breadthMultiplier * twRate);
    }

    // Prior: Base expectation + Top 10 Halo Boost (capped at 10.0)
    let prior = null;
    if (base !== null) {
      prior = Math.min(10.0, base + haloBoost);
    } else if (haloBoost > 0) {
      prior = haloBoost;
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
    if (dirAvg !== null) parts.push(`${m.director} avg ${dirAvg.toFixed(1)} (${dirVals.length} film${dirVals.length !== 1 ? 's' : ''})`);
    if (decAvg !== null && decade) parts.push(`${decade}s avg ${decAvg.toFixed(1)}`);
    if (haloBoost > 0) {
      const filmText = priorUniqueFilms > 1 ? `${priorUniqueFilms} masterworks` : '1 masterwork';
      parts.push(`Top 10 boost +${haloBoost.toFixed(2)} (${filmText})`);
    }
    if (actualScore !== null) parts.push(`${voterCount} vote${voterCount > 1 ? 's' : ''} so far`);
    const explanation = parts.join(' · ') || null;

    return {
      id: m.id,
      title: m.title,
      director: m.director,
      year: m.year,
      mn: m.mn === 1,
      watchlist: m.watchlist === 1,
      imdb_id: m.imdb_id ?? null,
      imdb_rating: m.imdb_rating ?? null,
      voterCount,
      ratings: ratingsMap,
      actualScore: actualScore !== null ? Math.round(actualScore * 100) / 100 : null,
      predictedScore,
      dirAvg:  dirAvg  !== null ? Math.round(dirAvg  * 100) / 100 : null,
      decAvg:  decAvg  !== null ? Math.round(decAvg  * 100) / 100 : null,
      decade,
      top10Bonus: Math.round(haloBoost * 100) / 100,
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
}));

// GET /api/recommendations/accuracy — Leave-One-Out Backtesting on Scored Movies
router.get('/accuracy', ah(async (req, res) => {
  const minVoters = Math.max(2, parseInt(req.query.minVoters) || 2);
  const minDirFilms = Math.max(1, parseInt(req.query.minDirFilms) || 2);
  const dw = 0.5;
  const ew = 0.5;
  const twRate = 0.15; // default 1.0x boost

  const [allMovies, allRatings, allTop3] = await Promise.all([
    db.all('SELECT * FROM movies'),
    db.all('SELECT movie_id, voter, score FROM ratings'),
    db.all('SELECT movie_id, voter, rank FROM top3'),
  ]);
  const movieById = new Map(allMovies.map(m => [m.id, m]));

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

  function computeFairBoosted(movieId) {
    const rs = ratingsByMovie[movieId] || [];
    if (rs.length < 2) return null;
    const sum = rs.reduce((a, r) => a + r.score, 0);
    const fair = sum / rs.length;
    const boost = (top3ByMovie[movieId] || []).reduce((a, rank) => a + rankBonus(rank), 0);
    return Math.min(10, fair + boost);
  }

  // Pre-calculate fairBoosted for all movies with >= 2 votes
  const fairBoostedMap = new Map();
  for (const m of allMovies) {
    const fb = computeFairBoosted(m.id);
    if (fb !== null) fairBoostedMap.set(m.id, fb);
  }

  // Index eligible movies by director and decade
  const dirFilmsMap = {};
  const decadeFilmsMap = {};
  for (const m of allMovies) {
    const fb = fairBoostedMap.get(m.id);
    if (fb != null && m.director) {
      if (!dirFilmsMap[m.director]) dirFilmsMap[m.director] = [];
      dirFilmsMap[m.director].push({ id: m.id, score: fb });
    }
    if (fb != null && m.year) {
      const dec = Math.floor(parseInt(m.year) / 10) * 10;
      if (!isNaN(dec)) {
        if (!decadeFilmsMap[dec]) decadeFilmsMap[dec] = [];
        decadeFilmsMap[dec].push({ id: m.id, score: fb });
      }
    }
  }

  // Index top3 picks by director
  const top3ByDirector = {};
  for (const t of allTop3) {
    const m = movieById.get(t.movie_id);
    if (m?.director) {
      if (!top3ByDirector[m.director]) top3ByDirector[m.director] = [];
      top3ByDirector[m.director].push(t);
    }
  }

  const scoredCandidates = allMovies.filter(m => (ratingsByMovie[m.id] || []).length >= minVoters);

  const evaluatedFilms = [];
  const errors = [];

  for (const m of scoredCandidates) {
    const actualScore = fairBoostedMap.get(m.id);
    if (actualScore == null) continue;

    const decade = m.year ? Math.floor(parseInt(m.year) / 10) * 10 : null;

    // Leave-One-Out for director: exclude m.id
    const otherDirFilms = (dirFilmsMap[m.director] || []).filter(x => x.id !== m.id);
    const dirAvg = otherDirFilms.length >= minDirFilms
      ? otherDirFilms.reduce((a, b) => a + b.score, 0) / otherDirFilms.length
      : null;

    // Leave-One-Out for decade: exclude m.id
    const otherDecFilms = (decade && decadeFilmsMap[decade])
      ? decadeFilmsMap[decade].filter(x => x.id !== m.id)
      : [];
    const decAvg = otherDecFilms.length > 0
      ? otherDecFilms.reduce((a, b) => a + b.score, 0) / otherDecFilms.length
      : null;

    // Base prior
    let base = null;
    if (dirAvg !== null && decAvg !== null) {
      base = dirAvg * dw + decAvg * ew;
    } else if (dirAvg !== null) {
      base = dirAvg;
    } else if (decAvg !== null) {
      base = decAvg;
    }

    // Halo boost from director's OTHER films in top 10
    const otherTop3Picks = (top3ByDirector[m.director] || []).filter(t => t.movie_id !== m.id);
    const otherPoints = otherTop3Picks.reduce((acc, t) => acc + rankBonus(t.rank), 0);
    const otherUniqueFilms = new Set(otherTop3Picks.map(t => t.movie_id)).size;

    let haloBoost = 0;
    if (otherPoints > 0) {
      const breadthMultiplier = 1.0 + 0.20 * Math.max(0, otherUniqueFilms - 1);
      haloBoost = Math.min(0.75, otherPoints * breadthMultiplier * twRate);
    }

    let prior = null;
    if (base !== null) {
      prior = Math.min(10.0, base + haloBoost);
    } else if (haloBoost > 0) {
      prior = haloBoost;
    }

    if (prior === null) continue;

    const diff = Math.round((actualScore - prior) * 100) / 100;
    const absError = Math.round(Math.abs(diff) * 100) / 100;
    errors.push(absError);

    let verdict = 'accurate';
    let verdictLabel = 'On Track';
    if (absError <= 0.5) {
      verdict = 'bullseye';
      verdictLabel = '🎯 Bullseye';
    } else if (diff >= 1.0) {
      verdict = 'surprise';
      verdictLabel = '🌟 Pleasantly Surprised';
    } else if (diff <= -1.0) {
      verdict = 'disappointment';
      verdictLabel = '📉 Underperformed';
    } else if (diff > 0.5) {
      verdict = 'overperformed';
      verdictLabel = '▲ Beat Prior';
    } else if (diff < -0.5) {
      verdict = 'underperformed';
      verdictLabel = '▼ Below Prior';
    }

    const ratingRows = ratingsByMovie[m.id] || [];
    const ratingsMap = {};
    for (const r of ratingRows) ratingsMap[r.voter] = r.score;

    evaluatedFilms.push({
      id: m.id,
      title: m.title,
      director: m.director,
      year: m.year,
      voterCount: ratingRows.length,
      ratings: ratingsMap,
      mn: m.mn === 1,
      watchlist: m.watchlist === 1,
      imdb_id: m.imdb_id ?? null,
      imdb_rating: m.imdb_rating ?? null,
      actualScore: Math.round(actualScore * 100) / 100,
      predictedPrior: Math.round(prior * 100) / 100,
      diff,
      absError,
      verdict,
      verdictLabel,
      dirAvg: dirAvg !== null ? Math.round(dirAvg * 100) / 100 : null,
      decAvg: decAvg !== null ? Math.round(decAvg * 100) / 100 : null,
      haloBoost: Math.round(haloBoost * 100) / 100,
      hasDirectorTrack: dirAvg !== null,
    });
  }

  // Assign catalog actualRank and priorRank across all evaluated films
  evaluatedFilms.sort((a, b) => b.actualScore - a.actualScore);
  evaluatedFilms.forEach((f, i) => {
    f.actualRank = i + 1;
  });

  const byPrior = [...evaluatedFilms].sort((a, b) => b.predictedPrior - a.predictedPrior);
  byPrior.forEach((f, i) => {
    f.priorRank = i + 1;
  });

  const total = errors.length;
  const mae = total > 0 ? Math.round((errors.reduce((a, b) => a + b, 0) / total) * 100) / 100 : 0;
  const withinHalf = errors.filter(e => e <= 0.5).length;
  const withinOne = errors.filter(e => e <= 1.0).length;

  const withDir = evaluatedFilms.filter(f => f.hasDirectorTrack);
  const maeWithDir = withDir.length > 0
    ? Math.round((withDir.reduce((a, b) => a + b.absError, 0) / withDir.length) * 100) / 100
    : null;

  // Top 10 highlights & extremes
  const topBullseyes = [...evaluatedFilms].sort((a, b) => a.absError - b.absError).slice(0, 10);
  const topSurprises = [...evaluatedFilms].sort((a, b) => b.diff - a.diff).slice(0, 10);
  const topDisappointments = [...evaluatedFilms].sort((a, b) => a.diff - b.diff).slice(0, 10);

  res.json({
    summary: {
      totalEvaluated: total,
      mae,
      maeWithDir,
      withinHalfCount: withinHalf,
      withinHalfPct: total > 0 ? Math.round((withinHalf / total) * 100) : 0,
      withinOneCount: withinOne,
      withinOnePct: total > 0 ? Math.round((withinOne / total) * 100) : 0,
      directorTrackCount: withDir.length,
    },
    topBullseyes,
    topSurprises,
    topDisappointments,
    films: evaluatedFilms,
  });
}));

module.exports = router;
