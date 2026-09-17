const express = require('express');
const db = require('../db');
const ah = require('../asyncHandler');
const { enrichMoviesBatch } = require('../enrich');
const { uniqueSlug } = require('../listSlugs');
const { SANDBOX_MODE } = require('../config');
const { getGroupWithMembers, getUserGroups } = require('../groupContext');

const router = express.Router();

// Lists are addressed by slug (/api/lists/christougenna-2026). Three things can
// resolve, in this order:
//   1. a list's current slug,
//   2. a slug it used to have, parked in list_slug_aliases by a rename — the
//      client redirects to the canonical one,
//   3. a bare numeric id, for links made before slugs existed.
// slugify() never produces a bare number, so (1) and (3) can't collide.
async function findList(key) {
  const table = SANDBOX_MODE ? 'v6_effective_lists' : 'lists';
  const aliasTable = SANDBOX_MODE ? 'v6_effective_list_slug_aliases' : 'list_slug_aliases';
  const bySlug = await db.get(`SELECT * FROM ${table} WHERE slug = ?`, key);
  if (bySlug) return bySlug;

  const alias = await db.get(`SELECT list_id FROM ${aliasTable} WHERE slug = ?`, key);
  if (alias) return db.get(`SELECT * FROM ${table} WHERE id = ?`, alias.list_id);

  if (/^\d+$/.test(String(key))) return db.get(`SELECT * FROM ${table} WHERE id = ?`, key);
  return undefined;
}

function getListGroupId(list) {
  return list.group_id || 1;
}

async function userCanAccessList(req, list) {
  if (SANDBOX_MODE && list.id >= 1000000) return true;
  if (req.session?.isAdmin || req.session?.voter === 'mnAdmin' || req.session?.username === 'mnAdmin') return true;
  const listGroupId = getListGroupId(list);
  if ((req.group?.id || 1) === listGroupId) return true;
  if (req.session?.userId) {
    const userGroups = await getUserGroups(req.session.userId);
    if (userGroups.some(g => g.id === listGroupId)) return true;
  }
  return false;
}

async function canEditList(req, list) {
  if (SANDBOX_MODE && list.id >= 1000000) return true;
  if (req.session?.isAdmin || req.session?.voter === 'mnAdmin' || req.session?.username === 'mnAdmin') return true;
  const listGroupId = getListGroupId(list);
  const targetGroup = (req.group?.id === listGroupId) ? req.group : await getGroupWithMembers(listGroupId);
  const isGroupAdmin = targetGroup?.members?.some(
    m => (m.id === req.session?.userId || m.displayName === req.session?.voter || m.username === req.session?.voter) && m.role === 'admin'
  );
  if (isGroupAdmin) return true;
  const isMember = targetGroup?.members?.some(
    m => (m.id === req.session?.userId || m.displayName === req.session?.voter || m.username === req.session?.voter)
  );
  return (req.session?.voter === list.created_by) && isMember;
}

function cleanTitle(value) {
  return String(value ?? '').trim().slice(0, 80);
}

function cleanDescription(value) {
  return String(value ?? '').trim().slice(0, 300);
}

// How many posters the index cards stack on each list card.
const POSTER_PREVIEW_COUNT = 6;

// GET /api/lists — lists for the current group with film counts and preview posters.
// `?movieId=` additionally flags which lists already hold that film.
router.get('/', ah(async (req, res) => {
  const groupId = req.group?.id || 1;
  const table = SANDBOX_MODE ? 'v6_effective_lists' : 'lists';
  const itemsTable = SANDBOX_MODE ? 'v6_effective_list_items' : 'list_items';

  const rows = await db.all(`
    SELECT l.*, COUNT(li.id) AS film_count
    FROM ${table} l
    LEFT JOIN ${itemsTable} li ON li.list_id = l.id
    WHERE COALESCE(l.group_id, 1) = ?
    GROUP BY l.id
    ORDER BY l.created_at DESC, l.id DESC
  `, groupId);

  const posterRows = await db.all(`
    SELECT li.list_id, m.poster_path
    FROM ${itemsTable} li
    JOIN movies m ON m.id = li.movie_id
    JOIN ${table} l ON l.id = li.list_id
    WHERE COALESCE(l.group_id, 1) = ? AND m.poster_path IS NOT NULL AND m.poster_path != ''
    ORDER BY li.list_id, li.position, li.id
  `, groupId);
  const postersByList = new Map();
  for (const row of posterRows) {
    const posters = postersByList.get(row.list_id) || [];
    if (posters.length < POSTER_PREVIEW_COUNT) posters.push(row.poster_path);
    postersByList.set(row.list_id, posters);
  }

  const movieId = parseInt(req.query.movieId, 10);
  let listsWithMovie = new Set();
  if (Number.isInteger(movieId)) {
    const memberships = await db.all(`
      SELECT li.list_id FROM ${itemsTable} li
      JOIN ${table} l ON l.id = li.list_id
      WHERE li.movie_id = ? AND COALESCE(l.group_id, 1) = ?
    `, movieId, groupId);
    listsWithMovie = new Set(memberships.map(m => m.list_id));
  }

  res.json(rows.map(r => ({
    ...r,
    group_id: r.group_id || 1,
    film_count: Number(r.film_count),
    posters: postersByList.get(r.id) || [],
    has_film: listsWithMovie.has(r.id),
  })));
}));

// GET /api/lists/:key — the list plus its films, fully enriched with the list group's context
router.get('/:key', ah(async (req, res) => {
  const list = await findList(req.params.key);
  if (!list) return res.status(404).json({ error: 'Not found' });
  if (!await userCanAccessList(req, list)) return res.status(404).json({ error: 'Not found' });

  const listGroupId = getListGroupId(list);
  const listGroup = (req.group?.id === listGroupId) ? req.group : await getGroupWithMembers(listGroupId);

  const itemsTable = (SANDBOX_MODE && list.id >= 1000000) ? 'sandbox_list_items' : 'list_items';
  const movies = await db.all(`
    SELECT m.* FROM ${itemsTable} li
    JOIN movies m ON m.id = li.movie_id
    WHERE li.list_id = ?
    ORDER BY li.position, li.id
  `, list.id);

  res.json({
    ...list,
    group_id: listGroupId,
    group_name: listGroup?.name || 'The Originals',
    films: await enrichMoviesBatch(movies, { group: listGroup })
  });
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
  const list = await db.get(`SELECT * FROM ${targetTable} WHERE id = ?`, result.lastInsertRowid);
  res.status(201).json({
    ...list,
    group_id: groupId,
    group_name: req.group?.name || 'The Originals',
    film_count: 0
  });
}));

// PATCH /api/lists/:key — rename / re-describe
router.patch('/:key', ah(async (req, res) => {
  const list = await findList(req.params.key);
  if (!list) return res.status(404).json({ error: 'Not found' });
  if (!await userCanAccessList(req, list)) return res.status(404).json({ error: 'Not found' });
  if (SANDBOX_MODE && list.id < 1000000) {
    return res.status(403).json({ error: 'Editing production lists is disabled in sandbox mode.' });
  }
  if (!await canEditList(req, list)) return res.status(403).json({ error: 'Only the list creator or club admin can edit this list' });

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
  const updated = await db.get(`SELECT * FROM ${listsTable} WHERE id = ?`, list.id);
  res.json({
    ...updated,
    group_id: updated.group_id || 1
  });
}));

// DELETE /api/lists/:key — items and slug aliases cascade, films themselves are never touched
router.delete('/:key', ah(async (req, res) => {
  const list = await findList(req.params.key);
  if (!list) return res.status(404).json({ error: 'Not found' });
  if (!await userCanAccessList(req, list)) return res.status(404).json({ error: 'Not found' });
  if (SANDBOX_MODE && list.id < 1000000) {
    return res.status(403).json({ error: 'Deleting production lists is disabled in sandbox mode.' });
  }
  if (!await canEditList(req, list)) return res.status(403).json({ error: 'Only the list creator or club admin can delete this list' });

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
  if (!await userCanAccessList(req, list)) return res.status(404).json({ error: 'Not found' });
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
  if (!await userCanAccessList(req, list)) return res.status(404).json({ error: 'Not found' });
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
  if (!await userCanAccessList(req, list)) return res.status(404).json({ error: 'Not found' });
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
