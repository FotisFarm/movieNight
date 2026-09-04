const express = require('express');
const db = require('../db');
const ah = require('../asyncHandler');
const { enrichMoviesBatch } = require('../enrich');

const router = express.Router();

// Lists are collaborative: anybody logged in can create one and add/remove
// films from any list. Renaming and deleting a list is restricted to whoever
// created it (and mnAdmin), so nobody can wipe someone else's list by accident.
function canEditList(req, list) {
  return req.session.voter === 'mnAdmin' || req.session.voter === list.created_by;
}

function cleanTitle(value) {
  return String(value ?? '').trim().slice(0, 80);
}

function cleanDescription(value) {
  return String(value ?? '').trim().slice(0, 300);
}

// How many posters the index cards stack on each list card.
const POSTER_PREVIEW_COUNT = 6;

// GET /api/lists — every list with its film count plus a few poster paths for the
// index cards. `?movieId=` additionally flags which lists already hold that film,
// which is what the MovieModal's list picker toggles against.
router.get('/', ah(async (req, res) => {
  const rows = await db.all(`
    SELECT l.*, COUNT(li.id) AS film_count
    FROM lists l
    LEFT JOIN list_items li ON li.list_id = l.id
    GROUP BY l.id
    ORDER BY l.created_at DESC, l.id DESC
  `);

  // One pass over every list's films, in list order, keeping the first few posters
  // per list — cheaper than a correlated subquery per list.
  const posterRows = await db.all(`
    SELECT li.list_id, m.poster_path
    FROM list_items li
    JOIN movies m ON m.id = li.movie_id
    WHERE m.poster_path IS NOT NULL AND m.poster_path != ''
    ORDER BY li.list_id, li.position, li.id
  `);
  const postersByList = new Map();
  for (const row of posterRows) {
    const posters = postersByList.get(row.list_id) || [];
    if (posters.length < POSTER_PREVIEW_COUNT) posters.push(row.poster_path);
    postersByList.set(row.list_id, posters);
  }

  const movieId = parseInt(req.query.movieId, 10);
  let listsWithMovie = new Set();
  if (Number.isInteger(movieId)) {
    const memberships = await db.all('SELECT list_id FROM list_items WHERE movie_id = ?', movieId);
    listsWithMovie = new Set(memberships.map(m => m.list_id));
  }

  res.json(rows.map(r => ({
    ...r,
    film_count: Number(r.film_count),
    posters: postersByList.get(r.id) || [],
    has_film: listsWithMovie.has(r.id),
  })));
}));

// GET /api/lists/:id — the list plus its films, fully enriched and in order
router.get('/:id', ah(async (req, res) => {
  const list = await db.get('SELECT * FROM lists WHERE id = ?', req.params.id);
  if (!list) return res.status(404).json({ error: 'Not found' });

  const movies = await db.all(`
    SELECT m.* FROM list_items li
    JOIN movies m ON m.id = li.movie_id
    WHERE li.list_id = ?
    ORDER BY li.position, li.id
  `, list.id);

  res.json({ ...list, films: await enrichMoviesBatch(movies) });
}));

// POST /api/lists
router.post('/', ah(async (req, res) => {
  const title = cleanTitle(req.body.title);
  if (!title) return res.status(400).json({ error: 'Title is required' });

  const result = await db.run(
    'INSERT INTO lists (title, description, created_by) VALUES (?, ?, ?)',
    title, cleanDescription(req.body.description), req.session.voter
  );
  const list = await db.get('SELECT * FROM lists WHERE id = ?', result.lastInsertRowid);
  res.status(201).json({ ...list, film_count: 0 });
}));

// PATCH /api/lists/:id — rename / re-describe
router.patch('/:id', ah(async (req, res) => {
  const list = await db.get('SELECT * FROM lists WHERE id = ?', req.params.id);
  if (!list) return res.status(404).json({ error: 'Not found' });
  if (!canEditList(req, list)) return res.status(403).json({ error: 'Only the list creator can edit this list' });

  const title = req.body.title !== undefined ? cleanTitle(req.body.title) : list.title;
  if (!title) return res.status(400).json({ error: 'Title is required' });
  const description = req.body.description !== undefined
    ? cleanDescription(req.body.description)
    : list.description;

  await db.run('UPDATE lists SET title = ?, description = ? WHERE id = ?', title, description, list.id);
  res.json(await db.get('SELECT * FROM lists WHERE id = ?', list.id));
}));

// DELETE /api/lists/:id — items cascade, films themselves are never touched
router.delete('/:id', ah(async (req, res) => {
  const list = await db.get('SELECT * FROM lists WHERE id = ?', req.params.id);
  if (!list) return res.status(404).json({ error: 'Not found' });
  if (!canEditList(req, list)) return res.status(403).json({ error: 'Only the list creator can delete this list' });

  await db.run('DELETE FROM lists WHERE id = ?', list.id);
  res.status(204).end();
}));

// POST /api/lists/:id/items { movie_id } — append (idempotent)
router.post('/:id/items', ah(async (req, res) => {
  const list = await db.get('SELECT * FROM lists WHERE id = ?', req.params.id);
  if (!list) return res.status(404).json({ error: 'Not found' });

  const movieId = parseInt(req.body.movie_id, 10);
  if (!Number.isInteger(movieId)) return res.status(400).json({ error: 'movie_id is required' });
  const movie = await db.get('SELECT id FROM movies WHERE id = ?', movieId);
  if (!movie) return res.status(404).json({ error: 'Film not found' });

  const last = await db.get('SELECT MAX(position) AS pos FROM list_items WHERE list_id = ?', list.id);
  await db.run(
    'INSERT OR IGNORE INTO list_items (list_id, movie_id, position) VALUES (?, ?, ?)',
    list.id, movieId, (last?.pos ?? -1) + 1
  );

  const count = await db.get('SELECT COUNT(*) AS n FROM list_items WHERE list_id = ?', list.id);
  res.status(201).json({ film_count: Number(count.n) });
}));

// DELETE /api/lists/:id/items/:movieId
router.delete('/:id/items/:movieId', ah(async (req, res) => {
  const result = await db.run(
    'DELETE FROM list_items WHERE list_id = ? AND movie_id = ?',
    req.params.id, req.params.movieId
  );
  if (result.changes === 0) return res.status(404).json({ error: 'Not on this list' });
  res.status(204).end();
}));

// PUT /api/lists/:id/items { order: [movieId, ...] } — manual reorder
router.put('/:id/items', ah(async (req, res) => {
  const list = await db.get('SELECT * FROM lists WHERE id = ?', req.params.id);
  if (!list) return res.status(404).json({ error: 'Not found' });

  const order = Array.isArray(req.body.order) ? req.body.order : null;
  if (!order) return res.status(400).json({ error: 'order must be an array of movie ids' });

  await db.transaction(async tx => {
    for (let i = 0; i < order.length; i++) {
      await tx.run(
        'UPDATE list_items SET position = ? WHERE list_id = ? AND movie_id = ?',
        i, list.id, order[i]
      );
    }
  });
  res.status(204).end();
}));

module.exports = router;
