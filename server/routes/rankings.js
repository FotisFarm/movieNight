const express = require('express');
const db = require('../db');
const { rankBonus } = require('../scoring');
const ah = require('../asyncHandler');

const router = express.Router();

const { GROUP_SIZE, MIN_VOTERS } = require('../config');

async function getAllEnriched(mnOnly = false) {
  let movies = await db.all(
    `SELECT m.*,
      (SELECT COUNT(*)                                    FROM ratings r WHERE r.movie_id = m.id) as voter_count,
      (SELECT SUM(r.score)                               FROM ratings r WHERE r.movie_id = m.id) as score_sum,
      (SELECT COUNT(*)                                   FROM top3 t   WHERE t.movie_id = m.id) as top3_count,
      (SELECT GROUP_CONCAT(r.voter, '|')                 FROM ratings r WHERE r.movie_id = m.id) as voter_names,
      (SELECT GROUP_CONCAT(t.voter || ':' || t.rank, '|') FROM top3 t  WHERE t.movie_id = m.id) as top3_entries
     FROM movies m
     WHERE voter_count >= ${MIN_VOTERS} ${mnOnly ? 'AND m.mn = 1' : ''}
    `
  );

  return movies.map(m => {
    const n = m.voter_count;
    const sum = m.score_sum || 0;
    const score = sum / GROUP_SIZE;
    const fairScore = sum / n;

    const voters = m.voter_names ? m.voter_names.split('|') : [];
    const top3Map = {};
    if (m.top3_entries) {
      for (const entry of m.top3_entries.split('|')) {
        const [voter, rank] = entry.split(':');
        if (voter) top3Map[voter] = parseInt(rank);
      }
    }
    const boost = Object.values(top3Map).reduce((acc, rank) => acc + rankBonus(rank), 0);

    return {
      id: m.id,
      title: m.title,
      director: m.director,
      year: m.year,
      mn: m.mn === 1,
      tokens: m.tokens,
      imdb_id: m.imdb_id ?? null,
      imdb_rating: m.imdb_rating ?? null,
      n,
      top3_count: m.top3_count || 0,
      boost,
      voters,
      top3: top3Map,
      score: Math.round(score * 100) / 100,
      fairScore: Math.round(fairScore * 100) / 100,
      boostedScore: Math.round(Math.min(10, score + boost) * 100) / 100,
      fairBoosted: Math.round(Math.min(10, fairScore + boost) * 100) / 100,
    };
  });
}

// GET /api/rankings
router.get('/', ah(async (req, res) => {
  const minDirFilms = Math.max(1, parseInt(req.query.minDirFilms) || 2);
  const all = await getAllEnriched(false);
  const mn  = all.filter(m => m.mn);

  const top = (arr, key, n = 25) =>
    [...arr].sort((a, b) =>
      b[key] - a[key]                                               // primary: score desc
      || b.n - a.n                                                  // tiebreak 1: more voters wins
      || b.boost - a.boost                                          // tiebreak 2: higher token value wins
      || (parseInt(a.year) || 9999) - (parseInt(b.year) || 9999)   // tiebreak 3: oldest year wins
    ).slice(0, n);

  const topByField = (arr, groupKey, scoreKey, { minCount = 1 } = {}) => {
    const map = {};
    for (const m of arr) {
      const k = groupKey === 'decade'
        ? (parseInt(m.year) ? String(Math.floor(parseInt(m.year) / 10) * 10) : null)
        : groupKey === 'year' ? (m.year || '').substring(0, 4)
        : m[groupKey];
      if (!k) continue;
      if (!map[k]) map[k] = { sum: 0, count: 0 };
      map[k].sum += m[scoreKey];
      map[k].count++;
    }
    return Object.entries(map)
      .map(([k, v]) => ({ [groupKey]: k, avg: Math.round((v.sum / v.count) * 100) / 100, count: v.count }))
      .filter(e => e.count >= minCount)
      .sort((a, b) => b.avg - a.avg || b.count - a.count)
      .slice(0, 25);
  };

  const gate = { minCount: minDirFilms };

  res.json({
    // Fair score (÷voters + tokens)
    fairAll:      top(all, 'fairBoosted'),
    fairDirsAll:  topByField(all, 'director', 'fairBoosted', gate),
    fairYearsAll: topByField(all, 'year', 'fairBoosted', gate),

    fairMn:       top(mn,  'fairBoosted'),
    fairDirsMn:   topByField(mn,  'director', 'fairBoosted', gate),
    fairYearsMn:  topByField(mn,  'year', 'fairBoosted', gate),

    // Group score (÷5 + tokens)
    groupAll:      top(all, 'boostedScore'),
    groupDirsAll:  topByField(all, 'director', 'boostedScore', gate),
    groupYearsAll: topByField(all, 'year', 'boostedScore', gate),

    groupMn:       top(mn,  'boostedScore'),
    groupDirsMn:   topByField(mn,  'director', 'boostedScore', gate),
    groupYearsMn:  topByField(mn,  'year', 'boostedScore', gate),

    // Decade panels
    fairDecadesAll:  topByField(all, 'decade', 'fairBoosted', gate),
    fairDecadesMn:   topByField(mn,  'decade', 'fairBoosted', gate),
    groupDecadesAll: topByField(all, 'decade', 'boostedScore', gate),
    groupDecadesMn:  topByField(mn,  'decade', 'boostedScore', gate),
  });
}));

module.exports = router;
