const express = require('express');
const db = require('../db');
const { rankBonus } = require('../scoring');

const router = express.Router();

const { VOTERS, GROUP_SIZE } = require('../config');

function enrichMovie(movie) {
  const ratings = db
    .prepare('SELECT voter, score, comment FROM ratings WHERE movie_id = ?')
    .all(movie.id);
  const top3 = db
    .prepare('SELECT voter, rank FROM top3 WHERE movie_id = ?')
    .all(movie.id);
  const watchlistVotes = db
    .prepare('SELECT voter FROM watchlist_votes WHERE movie_id = ?')
    .all(movie.id)
    .map(r => r.voter);

  const ratingsMap = {};
  const commentsMap = {};
  for (const r of ratings) {
    ratingsMap[r.voter] = r.score;
    if (r.comment) commentsMap[r.voter] = r.comment;
  }

  const top3Map = {};
  for (const t of top3) top3Map[t.voter] = t.rank;

  const scores = VOTERS.map(v => ratingsMap[v]).filter(s => s != null);
  const n = scores.length;
  let score = null, fairScore = null, boostedScore = null, fairBoosted = null;

  const boost = VOTERS.map(v => top3Map[v]).filter(r => r != null).reduce((acc, rank) => acc + rankBonus(rank), 0);

  let stdDev = null;
  if (n > 0) {
    const sum = scores.reduce((a, b) => a + b, 0);
    score = Math.round((sum / GROUP_SIZE) * 100) / 100;
    fairScore = Math.round((sum / n) * 100) / 100;
    boostedScore = Math.round(Math.min(10, score + boost) * 100) / 100;
    fairBoosted = Math.round(Math.min(10, fairScore + boost) * 100) / 100;
    if (n >= 2) {
      const mean = sum / n;
      stdDev = Math.round(Math.sqrt(scores.reduce((acc, s) => acc + (s - mean) ** 2, 0) / n) * 100) / 100;
    }
  }

  return {
    ...movie,
    mn: movie.mn === 1,
    watchlist: movie.watchlist === 1,
    ratings: ratingsMap,
    comments: commentsMap,
    top3: top3Map,
    watchlistVotes,
    voterCount: n,
    boost,
    score,
    fairScore,
    boostedScore,
    fairBoosted,
    stdDev,
  };
}

function enrichMoviesBatch(movies) {
  if (!movies.length) return [];
  const ids = movies.map(m => m.id);
  const placeholders = ids.map(() => '?').join(',');

  const ratingsRows = db.prepare(
    `SELECT movie_id, voter, score, comment FROM ratings WHERE movie_id IN (${placeholders})`
  ).all(...ids);

  const top3Rows = db.prepare(
    `SELECT movie_id, voter, rank FROM top3 WHERE movie_id IN (${placeholders})`
  ).all(...ids);

  const wlRows = db.prepare(
    `SELECT movie_id, voter FROM watchlist_votes WHERE movie_id IN (${placeholders})`
  ).all(...ids);

  // Build lookup maps
  const ratingsMap = {};
  const commentsMap = {};
  for (const r of ratingsRows) {
    if (!ratingsMap[r.movie_id]) ratingsMap[r.movie_id] = {};
    if (!commentsMap[r.movie_id]) commentsMap[r.movie_id] = {};
    ratingsMap[r.movie_id][r.voter] = r.score;
    if (r.comment) commentsMap[r.movie_id][r.voter] = r.comment;
  }

  const top3Map = {};
  for (const t of top3Rows) {
    if (!top3Map[t.movie_id]) top3Map[t.movie_id] = {};
    top3Map[t.movie_id][t.voter] = t.rank;
  }

  const wlMap = {};
  for (const w of wlRows) {
    if (!wlMap[w.movie_id]) wlMap[w.movie_id] = [];
    wlMap[w.movie_id].push(w.voter);
  }

  return movies.map(movie => {
    const ratings = ratingsMap[movie.id] || {};
    const comments = commentsMap[movie.id] || {};
    const top3 = top3Map[movie.id] || {};
    const watchlistVotes = wlMap[movie.id] || [];

    const scores = VOTERS.map(v => ratings[v]).filter(s => s != null);
    const n = scores.length;
    let score = null, fairScore = null, boostedScore = null, fairBoosted = null;

    const boost = VOTERS.map(v => top3[v]).filter(r => r != null).reduce((acc, rank) => acc + rankBonus(rank), 0);

    let stdDev = null;
    if (n > 0) {
      const sum = scores.reduce((a, b) => a + b, 0);
      score = Math.round((sum / GROUP_SIZE) * 100) / 100;
      fairScore = Math.round((sum / n) * 100) / 100;
      boostedScore = Math.round(Math.min(10, score + boost) * 100) / 100;
      fairBoosted = Math.round(Math.min(10, fairScore + boost) * 100) / 100;
      if (n >= 2) {
        const mean = sum / n;
        stdDev = Math.round(Math.sqrt(scores.reduce((acc, s) => acc + (s - mean) ** 2, 0) / n) * 100) / 100;
      }
    }

    return {
      ...movie,
      mn: movie.mn === 1,
      watchlist: movie.watchlist === 1,
      ratings,
      comments,
      top3,
      watchlistVotes,
      voterCount: n,
      boost,
      score,
      fairScore,
      boostedScore,
      fairBoosted,
      stdDev,
    };
  });
}

// GET /api/movies
router.get('/', (req, res) => {
  const { search, director, year, yearMin, yearMax, voter, voters, mn, watchlist, rated, minVoters, maxVoters } = req.query;

  let query = 'SELECT * FROM movies WHERE 1=1';
  const params = [];


  if (search)   { query += ' AND title LIKE ?'; params.push(`%${search}%`); }
  if (director) { query += ' AND director = ?'; params.push(director); }
  if (year)     { query += ' AND year = ?';     params.push(year); }
  if (yearMin)  { query += ' AND CAST(year AS INTEGER) >= ?'; params.push(parseInt(yearMin)); }
  if (yearMax)  { query += ' AND CAST(year AS INTEGER) <= ?'; params.push(parseInt(yearMax)); }
  if (mn === '1')        { query += ' AND mn = 1'; }
  if (watchlist === '1') { query += ' AND watchlist = 1'; }

  const voterList = (voters ? voters.split(',') : voter ? [voter] : []).map(v => v.trim()).filter(Boolean);
  if (voterList.length) {
    const exists = rated === 'unvoted'
      ? 'AND NOT EXISTS (SELECT 1 FROM ratings WHERE movie_id = movies.id AND voter = ?)'
      : 'AND EXISTS (SELECT 1 FROM ratings WHERE movie_id = movies.id AND voter = ?)';
    for (const v of voterList) {
      query += ` ${exists}`;
      params.push(v);
    }
  } else if (rated === 'voted' || rated === '1') {
    query += ' AND EXISTS (SELECT 1 FROM ratings WHERE movie_id = movies.id)';
  } else if (rated === 'unvoted') {
    query += ' AND NOT EXISTS (SELECT 1 FROM ratings WHERE movie_id = movies.id)';
  }

  if (minVoters) {
    query += ' AND (SELECT COUNT(*) FROM ratings WHERE movie_id = movies.id) >= ?';
    params.push(parseInt(minVoters));
  }
  if (maxVoters !== undefined && maxVoters !== '') {
    query += ' AND (SELECT COUNT(*) FROM ratings WHERE movie_id = movies.id) <= ?';
    params.push(parseInt(maxVoters));
  }

  query += ' ORDER BY title COLLATE NOCASE ASC';

  const movies = db.prepare(query).all(...params);
  res.json(enrichMoviesBatch(movies));
});

// POST /api/movies/:id/watchlist-vote  — must be before /:id
router.post('/:id/watchlist-vote', (req, res) => {
  const id = Number(req.params.id);
  const sessionVoter = req.session.voter;
  const voter = (sessionVoter === 'mnAdmin' && req.body.targetVoter) ? req.body.targetVoter : sessionVoter;
  const exists = db.prepare('SELECT 1 FROM watchlist_votes WHERE movie_id=? AND voter=?').get(id, voter);
  if (exists) {
    db.prepare('DELETE FROM watchlist_votes WHERE movie_id=? AND voter=?').run(id, voter);
  } else {
    if (sessionVoter !== 'mnAdmin') {
      const count = db.prepare('SELECT COUNT(*) as c FROM watchlist_votes WHERE voter=?').get(voter).c;
      if (count >= 3) return res.status(400).json({ error: 'vote_limit' });
    }
    db.prepare('INSERT INTO watchlist_votes (movie_id, voter) VALUES (?,?)').run(id, voter);
  }
  res.json({ ok: true });
});

// GET /api/movies/directors  — must be before /:id
router.get('/directors', (_req, res) => {
  const rows = db
    .prepare("SELECT DISTINCT director FROM movies WHERE director != '' ORDER BY director COLLATE NOCASE")
    .all();
  res.json(rows.map(r => r.director));
});

// GET /api/movies/top10-counts  — { voter: number of top picks }. Must be before /:id.
router.get('/top10-counts', (_req, res) => {
  const rows = db.prepare('SELECT voter, COUNT(*) AS n FROM top3 GROUP BY voter').all();
  const counts = {};
  for (const v of VOTERS) counts[v] = 0;
  for (const r of rows) counts[r.voter] = r.n;
  res.json(counts);
});

// PUT /api/movies/top10  — rewrite the session voter's own top picks (ranks 1..N) in order.
// Must be before /:id. Permission is implicit: it only ever touches req.session.voter's rows.
router.put('/top10', (req, res) => {
  const sessionVoter = req.session.voter;
  const isAdmin = sessionVoter === 'mnAdmin';
  // Admins may target any voter; everyone else can only rewrite their own.
  const voter = isAdmin && req.body.voter ? req.body.voter : sessionVoter;
  const order = Array.isArray(req.body.order) ? req.body.order : null;
  if (!order || !VOTERS.includes(voter)) return res.status(400).json({ error: 'Bad request' });
  const ids = order.map(Number).filter(Boolean).slice(0, 10);
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM top3 WHERE voter = ?').run(voter);
    const ins = db.prepare('INSERT INTO top3 (movie_id, voter, rank) VALUES (?, ?, ?)');
    ids.forEach((mid, i) => ins.run(mid, voter, i + 1));
  });
  tx();
  res.json({ ok: true });
});

// GET /api/movies/:id
router.get('/:id', (req, res) => {
  const movie = db.prepare('SELECT * FROM movies WHERE id = ?').get(req.params.id);
  if (!movie) return res.status(404).json({ error: 'Not found' });
  res.json(enrichMovie(movie));
});

// POST /api/movies
router.post('/', (req, res) => {
  const { director = '', title, year = '', mn = false, watchlist = false } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: 'title is required' });

  const { lastInsertRowid } = db.prepare(`
    INSERT INTO movies (director, title, year, mn, watchlist)
    VALUES (?, ?, ?, ?, ?)
  `).run(director.trim(), title.trim(), year.trim(), mn ? 1 : 0, watchlist ? 1 : 0);

  res.status(201).json(enrichMovie(
    db.prepare('SELECT * FROM movies WHERE id = ?').get(lastInsertRowid)
  ));
});

// PATCH /api/movies/:id
router.patch('/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const movie = db.prepare('SELECT * FROM movies WHERE id = ?').get(id);
  if (!movie) return res.status(404).json({ error: 'Not found' });

  const { director, title, year, mn, watchlist, cinobo, imdb_id, ratings, comments, top3 } = req.body;
  const sessionVoter = req.session.voter;
  const isAdmin = sessionVoter === 'mnAdmin';

  const updates = {};
  if (director !== undefined) updates.director = director;
  if (title !== undefined)    updates.title = title;
  if (year !== undefined)     updates.year = year;
  if (mn !== undefined)       updates.mn = mn ? 1 : 0;
  if (watchlist !== undefined) updates.watchlist = watchlist ? 1 : 0;
  if (cinobo !== undefined)   updates.cinobo = cinobo;
  if (imdb_id !== undefined)  updates.imdb_id = imdb_id;

  if (Object.keys(updates).length > 0) {
    const setClause = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    db.prepare(`UPDATE movies SET ${setClause} WHERE id = ?`)
      .run(...Object.values(updates), id);
  }

  if (ratings) {
    const upsertRating = db.prepare(`
      INSERT INTO ratings (movie_id, voter, score) VALUES (?, ?, ?)
      ON CONFLICT(movie_id, voter) DO UPDATE SET score = excluded.score
    `);
    const deleteRating = db.prepare('DELETE FROM ratings WHERE movie_id = ? AND voter = ?');

    const votersToRate = (isAdmin || VOTERS.includes(sessionVoter)) ? VOTERS : [sessionVoter];
    for (const voter of votersToRate) {
      if (voter in ratings) {
        if (!isAdmin && voter !== sessionVoter) continue;
        const score = ratings[voter];
        if (score === null || score === '') {
          deleteRating.run(id, voter);
        } else {
          upsertRating.run(id, voter, parseFloat(score));
        }
      }
    }
  }

  if (comments) {
    const updateComment = db.prepare(
      'UPDATE ratings SET comment = ? WHERE movie_id = ? AND voter = ?'
    );
    const votersToComment = (isAdmin || VOTERS.includes(sessionVoter)) ? VOTERS : [sessionVoter];
    for (const voter of votersToComment) {
      if (voter in comments) {
        if (!isAdmin && voter !== sessionVoter) continue;
        updateComment.run(comments[voter] || '', id, voter);
      }
    }
  }

  if (top3) {
    const upsertTop3 = db.prepare(`
      INSERT INTO top3 (movie_id, voter, rank) VALUES (?, ?, ?)
      ON CONFLICT(movie_id, voter) DO UPDATE SET rank = excluded.rank
    `);
    const deleteTop3 = db.prepare('DELETE FROM top3 WHERE movie_id = ? AND voter = ?');
    const touched = new Set();

    for (const voter of VOTERS) {
      if (voter in top3) {
        if (!isAdmin && voter !== sessionVoter) continue;
        const rankNum = parseInt(top3[voter]);
        if (!rankNum) {
          deleteTop3.run(id, voter);
        } else if (rankNum >= 1 && rankNum <= 10) {
          upsertTop3.run(id, voter, rankNum);
        }
        touched.add(voter);
      }
    }

    // Re-normalise each touched voter's picks to contiguous ranks 1..N — closes the gap a removal leaves.
    const renumber = db.transaction(v => {
      const rows = db.prepare('SELECT id FROM top3 WHERE voter = ? ORDER BY rank, id').all(v);
      const upd = db.prepare('UPDATE top3 SET rank = ? WHERE id = ?');
      rows.forEach((r, i) => upd.run(i + 1, r.id));
    });
    for (const v of touched) renumber(v);
  }

  res.json(enrichMovie(db.prepare('SELECT * FROM movies WHERE id = ?').get(id)));
});

// DELETE /api/movies/:id
router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM movies WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.status(204).end();
});

module.exports = router;
