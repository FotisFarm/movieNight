const express = require('express');
const db = require('../db');
const { rankBonus } = require('../scoring');

const router = express.Router();

const GROUP_SIZE = 5;

function getAllEnriched(mnOnly = false) {
  let movies = db.prepare(
    `SELECT m.*,
      (SELECT COUNT(*)                                    FROM ratings r WHERE r.movie_id = m.id) as voter_count,
      (SELECT SUM(r.score)                               FROM ratings r WHERE r.movie_id = m.id) as score_sum,
      (SELECT COUNT(*)                                   FROM top3 t   WHERE t.movie_id = m.id) as top3_count,
      (SELECT GROUP_CONCAT(r.voter, '|')                 FROM ratings r WHERE r.movie_id = m.id) as voter_names,
      (SELECT GROUP_CONCAT(t.voter || ':' || t.rank, '|') FROM top3 t  WHERE t.movie_id = m.id) as top3_entries
     FROM movies m
     WHERE voter_count > 1 ${mnOnly ? 'AND m.mn = 1' : ''}
    `
  ).all();

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
router.get('/', (_req, res) => {
  const all = getAllEnriched(false);
  const mn  = all.filter(m => m.mn);

  const top = (arr, key, n = 10) =>
    [...arr].sort((a, b) =>
      b[key] - a[key]                                               // primary: score desc
      || b.n - a.n                                                  // tiebreak 1: more voters wins
      || b.boost - a.boost                                          // tiebreak 2: higher token value wins
      || (parseInt(a.year) || 9999) - (parseInt(b.year) || 9999)   // tiebreak 3: oldest year wins
    ).slice(0, n);

  const topByField = (arr, groupKey, scoreKey) => {
    const map = {};
    for (const m of arr) {
      const k = groupKey === 'year' ? (m.year || '').substring(0, 4) : m[groupKey];
      if (!k) continue;
      if (!map[k]) map[k] = { sum: 0, count: 0 };
      map[k].sum += m[scoreKey];
      map[k].count++;
    }
    return Object.entries(map)
      .map(([k, v]) => ({ [groupKey]: k, avg: Math.round((v.sum / v.count) * 100) / 100, count: v.count }))
      .sort((a, b) => b.avg - a.avg || b.count - a.count)
      .slice(0, 10);
  };

  res.json({
    // Fair score (÷voters + tokens)
    fairAll:      top(all, 'fairBoosted'),
    fairDirsAll:  topByField(all, 'director', 'fairBoosted'),
    fairYearsAll: topByField(all, 'year', 'fairBoosted'),

    fairMn:       top(mn,  'fairBoosted'),
    fairDirsMn:   topByField(mn,  'director', 'fairBoosted'),
    fairYearsMn:  topByField(mn,  'year', 'fairBoosted'),

    // Group score (÷5 + tokens)
    groupAll:      top(all, 'boostedScore'),
    groupDirsAll:  topByField(all, 'director', 'boostedScore'),
    groupYearsAll: topByField(all, 'year', 'boostedScore'),

    groupMn:       top(mn,  'boostedScore'),
    groupDirsMn:   topByField(mn,  'director', 'boostedScore'),
    groupYearsMn:  topByField(mn,  'year', 'boostedScore'),
  });
});

module.exports = router;
