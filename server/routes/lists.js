const express = require('express');
const db = require('../db');
const ah = require('../asyncHandler');
const { enrichMoviesBatch } = require('../enrich');
const { uniqueSlug } = require('../listSlugs');
const { SANDBOX_MODE } = require('../config');

const router = express.Router();

// Lists are addressed by slug (/api/lists/christougenna-2026). Three things can
// resolve, in this order:
//   1. a list's current slug,
//   2. a slug it used to have, parked in list_slug_aliases by a rename — the
//      client redirects to the canonical one,
//   3. a bare numeric id, for links made before slugs existed.
// slugify() never produces a bare number, so (1) and (3) can't collide.
async function findList(key) {
  const bySlug = await db.get('SELECT * FROM lists WHERE slug = ?', key);
  if (bySlug) return bySlug;

  const alias = await db.get('SELECT list_id FROM list_slug_aliases WHERE slug = ?', key);
  if (alias) return db.get('SELECT * FROM lists WHERE id = ?', alias.list_id);

  if (/^\d+$/.test(String(key))) return db.get('SELECT * FROM lists WHERE id = ?', key);
  return undefined;
}

// Lists are collaborative: anybody logged in can create one and add/remove
// films from any list. Renaming and deleting a list is restricted to whoever
// created it (and mnAdmin), so nobody can wipe someone else's list by accident.
function canEditList(req, list) {
  if (SANDBOX_MODE && list.id >= 1000000) return true;
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
  const groupId = req.group?.id || 1;
  const rows = await db.all(`
    SELECT l.*, COUNT(li.id) AS film_count
    FROM lists l
    LEFT JOIN list_items li ON li.list_id = l.id
    WHERE l.group_id = ? OR l.group_id IS NULL OR ? = 1
    GROUP BY l.id
    ORDER BY l.created_at DESC, l.id DESC
  `, groupId, groupId);

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

// GET /api/lists/:key — the list plus its films, fully enriched and in order.
// The response carries the canonical `slug`, so a client that arrived on an old
// alias or a numeric id can correct its own URL.
router.get('/:key', ah(async (req, res) => {
  const list = await findList(req.params.key);
  if (!list) return res.status(404).json({ error: 'Not found' });

  const movies = await db.all(`
    SELECT m.* FROM list_items li
    JOIN movies m ON m.id = li.movie_id
    WHERE li.list_id = ?
    ORDER BY li.position, li.id
  `, list.id);

  res.json({ ...list, films: await enrichMoviesBatch(movies, { group: req.group }) });
}));

// POST /api/lists
router.post('/', ah(async (req, res) => {
  const title = cleanTitle(req.body.title);
  if (!title) return res.status(400).json({ error: 'Title is required' });

  const targetTable = SANDBOX_MODE ? 'sandbox_lists' : 'lists';
  const groupId = req.group?.id || 1;
  const result = await db.run(
    `INSERT INTO ${targetTable} (title, description, created_by, slug, group_id) VALUES (?, ?, ?, ?, ?)`,
    title, cleanDescription(req.body.description), req.session.voter, await uniqueSlug(db, title), groupId
  );
  const list = await db.get('SELECT * FROM lists WHERE id = ?', result.lastInsertRowid);
  res.status(201).json({ ...list, film_count: 0 });
}));

// PATCH /api/lists/:key — rename / re-describe
router.patch('/:key', ah(async (req, res) => {
  const list = await findList(req.params.key);
  if (!list) return res.status(404).json({ error: 'Not found' });
  if (SANDBOX_MODE && list.id < 1000000) {
    return res.status(403).json({ error: 'Editing production lists is disabled in sandbox mode.' });
  }
  if (!canEditList(req, list)) return res.status(403).json({ error: 'Only the list creator can edit this list' });

  const title = req.body.title !== undefined ? cleanTitle(req.body.title) : list.title;
  if (!title) return res.status(400).json({ error: 'Title is required' });
  const description = req.body.description !== undefined
    ? cleanDescription(req.body.description)
    : list.description;

  const isSandboxList = SANDBOX_MODE && (list.id >= 1000000);
  const listsTable = isSandboxList ? 'sandbox_lists' : 'lists';
  const aliasTable = isSandboxList ? 'sandbox_list_slug_aliases' : 'list_slug_aliases';

  // A rename re-slugs the list so the URL keeps matching the name on screen,
  // and parks the outgoing slug as an alias so links already shared still land
  // here. The alias table doubles as the "don't reuse this" record, so a later
  // list can't claim a slug that still points somewhere.
  let slug = list.slug;
  if (title !== list.title) {
    slug = await uniqueSlug(db, title, list.id);
    if (slug !== list.slug) {
      await db.transaction(async tx => {
        // This list may be reclaiming a slug it parked in an earlier rename.
        await tx.run(`DELETE FROM ${aliasTable} WHERE slug = ?`, slug);
        if (list.slug) {
          await tx.run(`INSERT OR REPLACE INTO ${aliasTable} (slug, list_id) VALUES (?, ?)`, list.slug, list.id);
        }
        await tx.run(`UPDATE ${listsTable} SET slug = ? WHERE id = ?`, slug, list.id);
      });
    }
  }

  await db.run(`UPDATE ${listsTable} SET title = ?, description = ? WHERE id = ?`, title, description, list.id);
  res.json(await db.get('SELECT * FROM lists WHERE id = ?', list.id));
}));

// DELETE /api/lists/:key — items and slug aliases cascade, films themselves are never touched
router.delete('/:key', ah(async (req, res) => {
  const list = await findList(req.params.key);
  if (!list) return res.status(404).json({ error: 'Not found' });
  if (SANDBOX_MODE && list.id < 1000000) {
    return res.status(403).json({ error: 'Deleting production lists is disabled in sandbox mode.' });
  }
  if (!canEditList(req, list)) return res.status(403).json({ error: 'Only the list creator can delete this list' });

  if (SANDBOX_MODE && list.id >= 1000000) {
    await db.transaction(async tx => {
      await tx.run('DELETE FROM sandbox_list_items WHERE list_id = ?', list.id);
      await tx.run('DELETE FROM sandbox_list_slug_aliases WHERE list_id = ?', list.id);
      await tx.run('DELETE FROM sandbox_lists WHERE id = ?', list.id);
    });
  } else {
    await db.run('DELETE FROM lists WHERE id = ?', list.id);
  }
  res.status(204).end();
}));

// POST /api/lists/:key/items { movie_id } — append (idempotent)
router.post('/:key/items', ah(async (req, res) => {
  const list = await findList(req.params.key);
  if (!list) return res.status(404).json({ error: 'Not found' });
  if (SANDBOX_MODE && list.id < 1000000) {
    return res.status(403).json({ error: 'Modifying production lists is disabled in sandbox mode.' });
  }

  const movieId = parseInt(req.body.movie_id, 10);
  if (!Number.isInteger(movieId)) return res.status(400).json({ error: 'movie_id is required' });
  const movie = await db.get('SELECT id FROM movies WHERE id = ?', movieId);
  if (!movie) return res.status(404).json({ error: 'Film not found' });

  const itemsTable = (SANDBOX_MODE && list.id >= 1000000) ? 'sandbox_list_items' : 'list_items';
  const last = await db.get(`SELECT MAX(position) AS pos FROM ${itemsTable} WHERE list_id = ?`, list.id);
  await db.run(
    `INSERT OR IGNORE INTO ${itemsTable} (list_id, movie_id, position) VALUES (?, ?, ?)`,
    list.id, movieId, (last?.pos ?? -1) + 1
  );

  const count = await db.get(`SELECT COUNT(*) AS n FROM ${itemsTable} WHERE list_id = ?`, list.id);
  res.status(201).json({ film_count: Number(count.n) });
}));

// DELETE /api/lists/:key/items/:movieId
router.delete('/:key/items/:movieId', ah(async (req, res) => {
  const list = await findList(req.params.key);
  if (!list) return res.status(404).json({ error: 'Not found' });
  if (SANDBOX_MODE && list.id < 1000000) {
    return res.status(403).json({ error: 'Modifying production lists is disabled in sandbox mode.' });
  }

  const itemsTable = (SANDBOX_MODE && list.id >= 1000000) ? 'sandbox_list_items' : 'list_items';
  const result = await db.run(
    `DELETE FROM ${itemsTable} WHERE list_id = ? AND movie_id = ?`,
    list.id, req.params.movieId
  );
  if (result.changes === 0) return res.status(404).json({ error: 'Not on this list' });
  res.status(204).end();
}));

// PUT /api/lists/:key/items { order: [movieId, ...] } — manual reorder
router.put('/:key/items', ah(async (req, res) => {
  const list = await findList(req.params.key);
  if (!list) return res.status(404).json({ error: 'Not found' });
  if (SANDBOX_MODE && list.id < 1000000) {
    return res.status(403).json({ error: 'Modifying production lists is disabled in sandbox mode.' });
  }

  const order = Array.isArray(req.body.order) ? req.body.order : null;
  if (!order) return res.status(400).json({ error: 'order must be an array of movie ids' });

  const itemsTable = (SANDBOX_MODE && list.id >= 1000000) ? 'sandbox_list_items' : 'list_items';
  await db.transaction(async tx => {
    for (let i = 0; i < order.length; i++) {
      await tx.run(
        `UPDATE ${itemsTable} SET position = ? WHERE list_id = ? AND movie_id = ?`,
        i, list.id, order[i]
      );
    }
  });
  res.status(204).end();
}));

module.exports = router;
