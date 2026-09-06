const express = require('express');
const db = require('../db');
const ah = require('../asyncHandler');
const { VOTERS, GROUP_SIZE } = require('../config');

const router = express.Router();

// POST /api/session/contenders
// Calculates personalized consensus contenders for "Tonight's Session"
// tailored to the exact attendees in the room.
router.post('/contenders', ah(async (req, res) => {
  const {
    attendees: reqAttendees,
    pool = 'watchlist',
    listId,
    maxRuntime,
    minRuntime,
    decade,
    limit = 8,
  } = req.body;

  // Validate and sanitize attendees (fallback to all registered voters)
  const validAttendees = Array.isArray(reqAttendees) && reqAttendees.length > 0
    ? reqAttendees.filter(v => VOTERS.includes(v))
    : VOTERS;
  const attendees = validAttendees.length > 0 ? validAttendees : VOTERS;

  // Independent full-table reads in one concurrent round-trip
  const [allMovies, allRatings, allTop3, allWlVotes] = await Promise.all([
    db.all('SELECT id, title, year, director, runtime, poster_path, watchlist, mn, cinobo FROM movies'),
    db.all('SELECT movie_id, voter, score FROM ratings'),
    db.all('SELECT movie_id, voter, rank FROM top3'),
    db.all('SELECT movie_id, voter FROM watchlist_votes'),
  ]);

  const movieById = new Map(allMovies.map(m => [m.id, m]));

  // Index ratings and baselines
  const ratingsByMovie = {};
  const voterRatings = {};
  const voterDecadeAvg = {};
  const voterDirAvg = {};

  for (const v of VOTERS) {
    voterRatings[v] = [];
    voterDecadeAvg[v] = {};
    voterDirAvg[v] = {};
  }

  for (const r of allRatings) {
    (ratingsByMovie[r.movie_id] ||= []).push(r);
    if (voterRatings[r.voter]) {
      voterRatings[r.voter].push(r);
      const m = movieById.get(r.movie_id);
      if (m) {
        if (m.year) {
          const dec = Math.floor(parseInt(m.year, 10) / 10) * 10;
          if (!isNaN(dec)) (voterDecadeAvg[r.voter][dec] ||= []).push(r.score);
        }
        if (m.director) {
          (voterDirAvg[r.voter][m.director] ||= []).push(r.score);
        }
      }
    }
  }

  // Voter baselines & means
  const voterMean = {};
  for (const v of VOTERS) {
    const scores = voterRatings[v].map(r => r.score);
    voterMean[v] = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 7.0;
    for (const dec in voterDecadeAvg[v]) {
      const arr = voterDecadeAvg[v][dec];
      voterDecadeAvg[v][dec] = arr.reduce((a, b) => a + b, 0) / arr.length;
    }
    for (const dir in voterDirAvg[v]) {
      const arr = voterDirAvg[v][dir];
      voterDirAvg[v][dir] = arr.reduce((a, b) => a + b, 0) / arr.length;
    }
  }

  // Index Top 10 directors per voter
  const voterTopDirs = {};
  for (const t of allTop3) {
    const m = movieById.get(t.movie_id);
    if (m?.director) {
      (voterTopDirs[t.voter] ||= new Set()).add(m.director);
    }
  }

  // Index watchlist votes per movie
  const wlVotesByMovie = {};
  for (const w of allWlVotes) {
    (wlVotesByMovie[w.movie_id] ||= new Set()).add(w.voter);
  }

  // Optional: Custom list membership
  let listMovieIds = null;
  if (pool === 'list' && listId) {
    const items = await db.all('SELECT movie_id FROM list_items WHERE list_id = ?', listId);
    listMovieIds = new Set(items.map(i => i.movie_id));
  }

  // Filter pool candidates
  const totalWatchlist = allMovies.filter(m => m.watchlist === 1).length;

  let candidates = allMovies.filter(m => {
    // 1. Exclude films that ANY attendee has already watched/rated
    const existing = ratingsByMovie[m.id] || [];
    const attendeeRatings = existing.filter(r => attendees.includes(r.voter));
    if (attendeeRatings.length > 0) return false;

    // 2. Pool filtering
    if (pool === 'watchlist') {
      return m.watchlist === 1;
    }
    if (pool === 'list' && listMovieIds) {
      return listMovieIds.has(m.id);
    }
    if (pool === 'unwatched') {
      return existing.length === 0;
    }
    // 'all' includes anything with <= 1 global votes
    return existing.length <= 1;
  });

  const poolCountBeforeRuntime = candidates.length;

  // 3. Runtime filtering
  if (maxRuntime && typeof maxRuntime === 'number') {
    candidates = candidates.filter(m => !m.runtime || m.runtime <= maxRuntime);
  }
  if (minRuntime && typeof minRuntime === 'number') {
    candidates = candidates.filter(m => !m.runtime || m.runtime >= minRuntime);
  }

  // 4. Decade filtering
  if (decade) {
    const targetDec = parseInt(decade, 10);
    candidates = candidates.filter(m => {
      if (!m.year) return false;
      const dec = Math.floor(parseInt(m.year, 10) / 10) * 10;
      return dec === targetDec;
    });
  }

  // Score each candidate film for the attendee room
  const scored = candidates.map(m => {
    const mDecade = m.year ? Math.floor(parseInt(m.year, 10) / 10) * 10 : null;
    const wlVoters = wlVotesByMovie[m.id] || new Set();

    const attendeeBreakdown = attendees.map(voter => {
      const vMean = voterMean[voter] || 7.0;
      const vDec = (mDecade && voterDecadeAvg[voter]?.[mDecade]) ?? vMean;
      const vDir = (m.director && voterDirAvg[voter]?.[m.director]) ?? null;

      // Bayesian blend of director track record & decade affinity for this voter
      let pred = vDir !== null ? (vDir * 0.55 + vDec * 0.45) : vDec;

      // Top 10 director halo boost
      const hasTop10 = voterTopDirs[voter]?.has(m.director) || false;
      if (hasTop10) pred += 0.4;

      // Personal watchlist vote indicator
      const onWatchlist = wlVoters.has(voter);
      if (onWatchlist) pred += 0.3;

      pred = Math.min(10, Math.max(1, pred));
      return {
        voter,
        predictedScore: Math.round(pred * 10) / 10,
        onWatchlist,
        hasTop10,
      };
    });

    const preds = attendeeBreakdown.map(a => a.predictedScore);
    const avgPred = preds.reduce((a, b) => a + b, 0) / preds.length;
    const minPred = Math.min(...preds);
    const maxPred = Math.max(...preds);
    const spread = Math.round((maxPred - minPred) * 10) / 10;

    const attendeeWlCount = attendeeBreakdown.filter(a => a.onWatchlist).length;
    const unanimousWatchlist = attendeeWlCount === attendees.length && attendees.length > 1;

    // Consensus Session Match Formula:
    // 70% average satisfaction + 30% worst-case attendee satisfaction - spread penalty
    let sessionScore = (avgPred * 0.70) + (minPred * 0.30) - (spread * 0.08);

    // Watchlist bonus (unanimous interest gives strong signal)
    if (unanimousWatchlist) sessionScore += 0.35;
    else if (attendeeWlCount > 0) sessionScore += (attendeeWlCount / attendees.length) * 0.20;

    sessionScore = Math.min(10, Math.max(1, Math.round(sessionScore * 10) / 10));
    const matchPercentage = Math.round(Math.min(100, Math.max(50, (sessionScore / 10) * 100)));

    return {
      id: m.id,
      title: m.title,
      year: m.year,
      director: m.director,
      runtime: m.runtime || null,
      poster_path: m.poster_path || null,
      watchlist: m.watchlist === 1,
      cinobo: m.cinobo || '',
      sessionScore,
      matchPercentage,
      unanimousWatchlist,
      attendeeWlCount,
      crowdPleaser: spread <= 0.8,
      wildcard: spread >= 1.6,
      spread,
      attendeeBreakdown,
    };
  });

  // Sort by session match score desc, breaking ties by watchlist interest and title
  scored.sort((a, b) => {
    if (b.sessionScore !== a.sessionScore) return b.sessionScore - a.sessionScore;
    if (b.attendeeWlCount !== a.attendeeWlCount) return b.attendeeWlCount - a.attendeeWlCount;
    return a.title.localeCompare(b.title);
  });

  const cappedLimit = Math.min(30, Math.max(1, parseInt(limit, 10) || 8));
  const contenders = scored.slice(0, cappedLimit);

  res.json({
    contenders,
    meta: {
      attendees,
      pool,
      poolCountBeforeRuntime,
      totalCandidates: scored.length,
      totalWatchlist,
      isWatchlistEmpty: totalWatchlist === 0 && pool === 'watchlist',
    },
  });
}));

module.exports = router;
