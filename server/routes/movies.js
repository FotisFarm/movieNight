const express = require('express');
const db = require('../db');

const router = express.Router();

const VOTERS = ['Μητσέας', 'Παντελής', 'Στέλιας', 'Φώτης', 'Λεόντιος'];
const GROUP_SIZE = 5;

function enrichMovie(movie) {
  const ratings = db
    .prepare('SELECT voter, score, comment FROM ratings WHERE movie_id = ?')
    .all(movie.id);
  const top3 = db
    .prepare('SELECT voter, rank FROM top3 WHERE movie_id = ?')
    .all(movie.id);

  const ratingsMap = {};
  const commentsMap = {};
  for (const r of ratings) {
    ratingsMap[r.voter] = r.score;
    if (r.comment) commentsMap[r.voter] = r.comment;
  }

  const top3Map = {};
  for (const t of top3) top3Map[t.voter] = t.rank;

  const scores = Object.values(ratingsMap);
  const n = scores.length;
  let score = null, fairScore = null, boostedScore = null, fairBoosted = null;

  if (n > 0) {
    const sum = scores.reduce((a, b) => a + b, 0);
    score = Math.round((sum / GROUP_SIZE) * 100) / 100;
    fairScore = Math.round((sum / n) * 100) / 100;
    const RANK_BONUS = { 1: 1.0, 2: 0.6, 3: 0.4 };
    const boost = Object.values(top3Map).reduce((acc, rank) => acc + (RANK_BONUS[rank] || 0), 0);
    boostedScore = Math.round(Math.min(10, score + boost) * 100) / 100;
    fairBoosted = Math.round(Math.min(10, fairScore + boost) * 100) / 100;
  }

  return {
    ...movie,
    mn: movie.mn === 1,
    watchlist: movie.watchlist === 1,
    ratings: ratingsMap,
    comments: commentsMap,
    top3: top3Map,
    voterCount: n,
    score,
    fairScore,
    boostedScore,
    fairBoosted,
  };
}

// GET /api/movies
router.get('/', (req, res) => {
  const { search, director, year, voter, mn, watchlist, rated } = req.query;

  let query = 'SELECT * FROM movies WHERE 1=1';
  const params = [];

  if (search) {
    query += ' AND (LOWER(title) LIKE ? OR LOWER(director) LIKE ?)';
    params.push(`%${search.toLowerCase()}%`, `%${search.toLowerCase()}%`);
  }
  if (director) { query += ' AND director = ?'; params.push(director); }
  if (year)     { query += ' AND year = ?';     params.push(year); }
  if (mn === '1')        { query += ' AND mn = 1'; }
  if (watchlist === '1') { query += ' AND watchlist = 1'; }
  if (voter) {
    query += ' AND EXISTS (SELECT 1 FROM ratings WHERE movie_id = movies.id AND voter = ?)';
    params.push(voter);
  } else if (rated === '1') {
    query += ' AND EXISTS (SELECT 1 FROM ratings WHERE movie_id = movies.id)';
  }

  query += ' ORDER BY title COLLATE NOCASE ASC';

  const movies = db.prepare(query).all(...params);
  res.json(movies.map(enrichMovie));
});

// GET /api/movies/directors  — must be before /:id
router.get('/directors', (_req, res) => {
  const rows = db
    .prepare("SELECT DISTINCT director FROM movies WHERE director != '' ORDER BY director COLLATE NOCASE")
    .all();
  res.json(rows.map(r => r.director));
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

  const updates = {};
  if (director !== undefined) updates.director = director;
  if (title !== undefined)    updates.title = title;
  if (year !== undefined)     updates.year = year;
  if (mn !== undefined)       updates.mn = mn ? 1 : 0;
  if (watchlist !== undefined) updates.watchlist = watchlist ? 1 : 0;
  if (cinobo !== undefined)   updates.cinobo = cinobo;

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

    for (const voter of VOTERS) {
      if (voter in ratings) {
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
    for (const voter of VOTERS) {
      if (voter in comments) updateComment.run(comments[voter] || '', id, voter);
    }
  }

  if (top3) {
    const upsertTop3 = db.prepare(`
      INSERT INTO top3 (movie_id, voter, rank) VALUES (?, ?, ?)
      ON CONFLICT(movie_id, voter) DO UPDATE SET rank = excluded.rank
    `);
    const deleteTop3 = db.prepare('DELETE FROM top3 WHERE movie_id = ? AND voter = ?');

    for (const voter of VOTERS) {
      if (voter in top3) {
        const rank = top3[voter];
        if (!rank) {
          deleteTop3.run(id, voter);
        } else {
          upsertTop3.run(id, voter, parseInt(rank));
        }
      }
    }
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
