const express = require('express');
const router = express.Router();
const db = require('../db');

function stdDev(arr) {
  if (arr.length < 2) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const variance = arr.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / arr.length;
  return Math.sqrt(variance);
}

// GET /api/recap?year=2026&scope=mn
router.get('/', async (req, res) => {
  try {
    const group = req.group || { id: 1, name: 'The Originals', voters: [] };
    const isSiteAdmin = Boolean(req.session?.isAdmin || req.session?.voter === 'mnAdmin' || req.session?.username === 'mnAdmin');

    // Check site settings for recap visibility
    let recapEnabled = false;
    let defaultYear = '2026';
    try {
      const settingsRows = await db.all('SELECT key, value FROM site_settings');
      const settingsMap = Object.fromEntries(settingsRows.map(r => [r.key, r.value]));
      recapEnabled = settingsMap.recap_enabled === '1';
      if (settingsMap.recap_year) defaultYear = settingsMap.recap_year;
    } catch (_) {}

    // If disabled and not admin, return 403
    if (!recapEnabled && !isSiteAdmin) {
      return res.status(403).json({ error: 'Recap is not currently enabled by site admin' });
    }

    const year = req.query.year || defaultYear;
    const scope = req.query.scope === 'all' ? 'all' : 'mn';

    const groupVoters = group.includeGuests
      ? (group.allVoters || group.voters)
      : group.voters;

    if (!groupVoters || groupVoters.length === 0) {
      return res.json({
        year,
        scope,
        group: { id: group.id, name: group.name },
        empty: true,
      });
    }

    // 1. Fetch group movie statuses
    const moviesWithStatus = await db.all(`
      SELECT m.*, COALESCE(gms.mn, CASE WHEN ? = 1 THEN m.mn ELSE 0 END) AS group_mn
      FROM movies m
      LEFT JOIN group_movie_status gms ON gms.movie_id = m.id AND gms.group_id = ?
    `, group.id, group.id);

    const movieMap = new Map(moviesWithStatus.map(m => [m.id, m]));

    // 2. Fetch voter member info (for avatars)
    const members = group.members || [];
    const avatarMap = new Map(members.map(m => [m.displayName, m.avatarUrl]));

    // 3. Resolve films and ratings within target year and group voters
    let relevantMovieIds = new Set();
    let ratingsRows = [];
    let top10Rows = [];

    const voterPlaceholders = groupVoters.map(() => '?').join(',');

    if (year === 'all') {
      // All time
      ratingsRows = await db.all(`
        SELECT movie_id, voter, score FROM ratings
        WHERE voter IN (${voterPlaceholders}) AND score IS NOT NULL
      `, ...groupVoters);

      top10Rows = await db.all(`
        SELECT movie_id, voter, rank FROM top3
        WHERE voter IN (${voterPlaceholders}) AND rank IS NOT NULL
      `, ...groupVoters);

      for (const r of ratingsRows) relevantMovieIds.add(r.movie_id);
    } else {
      // Specific year: inspect rating_history for touch events in that year
      const historyRows = await db.all(`
        SELECT movie_id, voter, kind, score, rank, changed_at
        FROM rating_history
        WHERE strftime('%Y', changed_at) = ? AND voter IN (${voterPlaceholders})
      `, year, ...groupVoters);

      for (const h of historyRows) {
        if (h.kind === 'score' && h.score != null) {
          relevantMovieIds.add(h.movie_id);
        } else if (h.kind === 'top10' && h.rank != null) {
          relevantMovieIds.add(h.movie_id);
          top10Rows.push({ movie_id: h.movie_id, voter: h.voter, rank: h.rank });
        }
      }

      // If history is sparse, also check current ratings for movies where mn is set
      const currentRatings = await db.all(`
        SELECT movie_id, voter, score FROM ratings
        WHERE voter IN (${voterPlaceholders}) AND score IS NOT NULL
      `, ...groupVoters);

      if (historyRows.length > 0) {
        // Use current ratings for films touched in that year
        ratingsRows = currentRatings.filter(r => relevantMovieIds.has(r.movie_id));
      } else {
        // Fallback: if no history exists for that year, use current ratings for MN films
        ratingsRows = currentRatings;
        for (const r of ratingsRows) relevantMovieIds.add(r.movie_id);
      }
    }

    // Filter by scope
    let scopedRatings = ratingsRows.filter(r => {
      const m = movieMap.get(r.movie_id);
      if (!m) return false;
      if (scope === 'mn') return m.group_mn > 0;
      return true;
    });

    const scopedMovieIds = [...new Set(scopedRatings.map(r => r.movie_id))];

    // Compute stats per movie
    const movieStats = [];
    const movieRatingsMap = new Map();

    for (const r of scopedRatings) {
      if (!movieRatingsMap.has(r.movie_id)) {
        movieRatingsMap.set(r.movie_id, { movie: movieMap.get(r.movie_id), ratings: [] });
      }
      movieRatingsMap.get(r.movie_id).ratings.push({ voter: r.voter, score: r.score });
    }

    let totalRuntimeMinutes = 0;
    const distinctFilmsCount = movieRatingsMap.size;

    for (const [id, data] of movieRatingsMap.entries()) {
      const m = data.movie;
      if (m.runtime) totalRuntimeMinutes += Number(m.runtime);

      const scores = data.ratings.map(r => r.score);
      const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
      const sd = stdDev(scores);

      movieStats.push({
        id,
        title: m.title,
        year: m.year,
        director: m.director,
        runtime: m.runtime,
        poster_path: m.poster_path,
        backdrop_path: m.backdrop_path,
        letterboxd_rating: m.letterboxd_rating,
        imdb_rating: m.imdb_rating,
        voterCount: scores.length,
        meanScore: mean,
        stdDev: sd,
        ratings: data.ratings,
        ratingsDict: Object.fromEntries(data.ratings.map(r => [r.voter, r.score])),
      });
    }

    // Sort by voters to find qualified films
    const minRequiredVoters = Math.min(2, Math.max(1, groupVoters.length >= 4 ? 3 : 2));
    const qualifiedMovies = movieStats.filter(m => m.voterCount >= minRequiredVoters);

    // 1. Film of the Year
    const byScore = [...qualifiedMovies].sort((a, b) => b.meanScore - a.meanScore || b.voterCount - a.voterCount);
    const filmOfTheYear = byScore[0] || movieStats[0] || null;

    // 2. Civil War (highest stdDev)
    const byStdDev = [...qualifiedMovies].sort((a, b) => b.stdDev - a.stdDev);
    const civilWar = byStdDev[0] || null;

    // 3. Unanimous Peace (lowest stdDev)
    const byPeace = [...qualifiedMovies].sort((a, b) => a.stdDev - b.stdDev);
    const unanimousPeace = byPeace[0] || null;

    // 4. Hidden Gem & Flop vs Letterboxd
    const withLb = qualifiedMovies.filter(m => m.letterboxd_rating != null).map(m => {
      const lb10 = Number(m.letterboxd_rating) * 2;
      return { ...m, lb10, delta: m.meanScore - lb10 };
    });
    withLb.sort((a, b) => b.delta - a.delta);
    const hiddenGem = withLb.length > 0 && withLb[0].delta > 0.5 ? withLb[0] : null;
    const overratedFlop = withLb.length > 0 && withLb[withLb.length - 1].delta < -0.5 ? withLb[withLb.length - 1] : null;

    // 5. Marathon & Sprint
    const withRuntime = movieStats.filter(m => m.runtime && m.runtime > 0).sort((a, b) => b.runtime - a.runtime);
    const marathon = withRuntime[0] || null;
    const sprint = withRuntime.length > 1 ? withRuntime[withRuntime.length - 1] : null;

    // 6. Overall average group score
    const allScores = scopedRatings.map(r => r.score);
    const groupMeanScore = allScores.length > 0 ? (allScores.reduce((a, b) => a + b, 0) / allScores.length) : 0;

    // 7. Individual Voter Profiles
    const voterMap = new Map();
    for (const v of groupVoters) {
      voterMap.set(v, new Map());
    }
    for (const r of scopedRatings) {
      if (voterMap.has(r.voter)) {
        voterMap.get(r.voter).set(r.movie_id, r.score);
      }
    }

    const voterSummaries = [];
    for (const v of groupVoters) {
      const vMovieScores = voterMap.get(v);
      const scores = [...vMovieScores.values()];
      if (scores.length === 0) continue;

      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;

      // Hot Take: single movie with largest divergence from movie mean
      let maxDiff = -1;
      let hotTake = null;
      let personalBest = null, maxScore = -1;
      let personalWorst = null, minScore = 999;

      for (const [mId, s] of vMovieScores.entries()) {
        const ms = movieStats.find(m => m.id === mId);
        if (!ms) continue;

        if (s > maxScore) { maxScore = s; personalBest = { title: ms.title, score: s }; }
        if (s < minScore) { minScore = s; personalWorst = { title: ms.title, score: s }; }

        if (ms.voterCount >= minRequiredVoters) {
          const diff = Math.abs(s - ms.meanScore);
          if (diff > maxDiff) {
            maxDiff = diff;
            hotTake = {
              title: ms.title,
              voterScore: s,
              meanScore: Number(ms.meanScore.toFixed(1)),
              diff: Number(diff.toFixed(2)),
              director: ms.director,
              year: ms.year,
            };
          }
        }
      }

      // Mean Absolute Deviation from group mean (how "rebellious" or "consensus" they are)
      let totalDev = 0, devCount = 0;
      for (const [mId, s] of vMovieScores.entries()) {
        const ms = movieStats.find(m => m.id === mId);
        if (ms && ms.voterCount >= minRequiredVoters) {
          totalDev += Math.abs(s - ms.meanScore);
          devCount++;
        }
      }
      const mad = devCount > 0 ? (totalDev / devCount) : 0;

      // Pairwise dynamics: find Soulmate & Rival
      let soulmate = null, lowestPairDiff = Infinity;
      let rival = null, highestPairDiff = -1;

      for (const v2 of groupVoters) {
        if (v === v2) continue;
        const v2Scores = voterMap.get(v2);
        if (!v2Scores) continue;

        const commonIds = [...vMovieScores.keys()].filter(id => v2Scores.has(id));
        if (commonIds.length < 3) continue;

        const pDiff = commonIds.reduce((sum, id) => sum + Math.abs(vMovieScores.get(id) - v2Scores.get(id)), 0) / commonIds.length;

        if (pDiff < lowestPairDiff) {
          lowestPairDiff = pDiff;
          soulmate = { voter: v2, meanDiff: Number(pDiff.toFixed(2)), commonCount: commonIds.length };
        }
        if (pDiff > highestPairDiff) {
          highestPairDiff = pDiff;
          rival = { voter: v2, meanDiff: Number(pDiff.toFixed(2)), commonCount: commonIds.length };
        }
      }

      // Top 10 additions in this timeframe
      const vTop10 = top10Rows.filter(t => t.voter === v).map(t => {
        const m = movieMap.get(t.movie_id);
        return { title: m ? m.title : 'Movie', rank: t.rank };
      });

      voterSummaries.push({
        voter: v,
        avatarUrl: avatarMap.get(v) || null,
        count: scores.length,
        average: Number(avg.toFixed(2)),
        mad: Number(mad.toFixed(2)),
        personalBest,
        personalWorst,
        hotTake,
        soulmate,
        rival,
        top10Additions: vTop10,
      });
    }

    // Assign Archetypes
    if (voterSummaries.length > 0) {
      const byAvg = [...voterSummaries].sort((a, b) => b.average - a.average);
      const byMad = [...voterSummaries].sort((a, b) => a.mad - b.mad);

      const hypemanVoter = byAvg[0]?.voter;
      const criticVoter = byAvg[byAvg.length - 1]?.voter;
      const oracleVoter = byMad[0]?.voter;
      const rebelVoter = byMad[byMad.length - 1]?.voter;

      for (const s of voterSummaries) {
        if (s.voter === hypemanVoter && byAvg.length >= 2) {
          s.archetype = '☀️ The Hypeman';
          s.archetypeDesc = 'Highest average rating awarded in the group';
        } else if (s.voter === criticVoter && byAvg.length >= 2) {
          s.archetype = '🧐 The Toughest Critic';
          s.archetypeDesc = 'Lowest average rating; high standards for every frame';
        } else if (s.voter === oracleVoter && byMad.length >= 3) {
          s.archetype = '🔮 The Group Oracle';
          s.archetypeDesc = 'Scores most consistently aligned with the room consensus';
        } else if (s.voter === rebelVoter && byMad.length >= 3) {
          s.archetype = '⚡ The Lone Wolf';
          s.archetypeDesc = 'Scores frequently clashed with the group average';
        } else {
          s.archetype = '🎯 The Purist';
          s.archetypeDesc = 'Balanced and discerning tastes across genres';
        }
      }
    }

    // Top Directors of the year
    const directorMap = new Map();
    for (const ms of movieStats) {
      if (ms.director) {
        const d = ms.director.trim();
        if (!directorMap.has(d)) directorMap.set(d, { count: 0, totalScore: 0 });
        const cur = directorMap.get(d);
        cur.count++;
        cur.totalScore += ms.meanScore;
      }
    }
    const topDirectors = [...directorMap.entries()]
      .filter(([_, d]) => d.count >= 2)
      .map(([name, d]) => ({ name, count: d.count, avgScore: Number((d.totalScore / d.count).toFixed(2)) }))
      .sort((a, b) => b.count - a.count || b.avgScore - a.avgScore)
      .slice(0, 5);

    // Available years in history
    let availableYears = ['2026', 'all'];
    try {
      const yrRows = await db.all("SELECT DISTINCT strftime('%Y', changed_at) as yr FROM rating_history WHERE changed_at IS NOT NULL ORDER BY yr DESC");
      const yrs = yrRows.map(r => r.yr).filter(Boolean);
      if (yrs.length > 0) {
        availableYears = [...new Set([...yrs, 'all'])];
      }
    } catch (_) {}

    res.json({
      group: {
        id: group.id,
        name: group.name,
        slug: group.slug,
      },
      year,
      scope,
      availableYears,
      recapEnabled,
      isSiteAdmin,
      groupStats: {
        totalFilms: distinctFilmsCount,
        totalScreenHours: Number((totalRuntimeMinutes / 60).toFixed(1)),
        groupMeanScore: Number(groupMeanScore.toFixed(2)),
        filmOfTheYear,
        civilWar,
        unanimousPeace,
        hiddenGem,
        overratedFlop,
        marathon,
        sprint,
        topDirectors,
      },
      voters: voterSummaries,
    });
  } catch (err) {
    console.error('[recap] Error generating recap:', err);
    res.status(500).json({ error: 'Failed to generate recap: ' + err.message });
  }
});

module.exports = router;
