const express = require('express');
const router = express.Router();
const db = require('../db');
const { hashPassword } = require('../auth-crypto');
const ah = require('../asyncHandler');

const DEFAULT_PASSWORD = process.env.MN_PASSWORD || 'movieNight5';

// GET /api/admin/users — list all users, their clubs, and ratings count
router.get('/users', ah(async (_req, res) => {
  const users = await db.all(`
    SELECT u.id, u.username, u.display_name, u.is_admin, u.created_at,
           (SELECT COUNT(*) FROM ratings r WHERE r.voter = u.display_name) AS ratings_count
    FROM users u
    ORDER BY u.id ASC
  `);

  const userIds = users.map(u => u.id);
  let memberships = [];
  if (userIds.length > 0) {
    const ph = userIds.map(() => '?').join(',');
    memberships = await db.all(`
      SELECT gm.user_id, gm.role, g.id AS group_id, g.name AS group_name, g.slug AS group_slug
      FROM group_members gm
      JOIN groups g ON g.id = gm.group_id
      WHERE gm.user_id IN (${ph})
      ORDER BY g.id ASC
    `, ...userIds);
  }

  const enriched = users.map(u => ({
    id: u.id,
    username: u.username,
    displayName: u.display_name,
    isAdmin: Boolean(u.is_admin),
    createdAt: u.created_at,
    ratingsCount: Number(u.ratings_count || 0),
    groups: memberships
      .filter(m => m.user_id === u.id)
      .map(m => ({ id: m.group_id, name: m.group_name, slug: m.group_slug, role: m.role })),
  }));

  res.json(enriched);
}));

// POST /api/admin/users — create a new user & assign to club
router.post('/users', ah(async (req, res) => {
  const { username, displayName, groupId, isAdmin = false, password } = req.body || {};

  const cleanUser = (username || '').trim().toLowerCase();
  const cleanDisplay = (displayName || '').trim();

  if (!cleanUser || !cleanDisplay) {
    return res.status(400).json({ error: 'Username and Display Name are required' });
  }

  if (cleanUser.length < 2 || cleanUser.length > 40) {
    return res.status(400).json({ error: 'Username must be between 2 and 40 characters' });
  }

  const existing = await db.get(
    'SELECT id FROM users WHERE LOWER(username) = LOWER(?) OR LOWER(display_name) = LOWER(?)',
    cleanUser, cleanDisplay
  );
  if (existing) {
    return res.status(409).json({ error: 'A user with this username or display name already exists' });
  }

  const passToUse = (typeof password === 'string' && password.trim().length >= 4)
    ? password.trim()
    : DEFAULT_PASSWORD;

  const pHash = hashPassword(passToUse);
  const adminFlag = isAdmin ? 1 : 0;

  const ins = await db.run(
    'INSERT INTO users (username, display_name, password_hash, is_admin) VALUES (?, ?, ?, ?)',
    cleanUser, cleanDisplay, pHash, adminFlag
  );

  const newUserId = ins.lastInsertRowid;

  if (groupId) {
    await db.run(
      'INSERT OR IGNORE INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
      Number(groupId), newUserId, adminFlag ? 'admin' : 'member'
    );
  }

  res.status(201).json({
    ok: true,
    user: {
      id: newUserId,
      username: cleanUser,
      displayName: cleanDisplay,
      isAdmin: Boolean(adminFlag),
      defaultPasswordUsed: passToUse === DEFAULT_PASSWORD,
    },
  });
}));

// POST /api/admin/users/:id/reset-password — reset user's password to default (movieNight5)
router.post('/users/:id/reset-password', ah(async (req, res) => {
  const userId = Number(req.params.id);
  const user = await db.get('SELECT id, username, display_name FROM users WHERE id = ?', userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const newHash = hashPassword(DEFAULT_PASSWORD);
  await db.run('UPDATE users SET password_hash = ? WHERE id = ?', newHash, userId);

  res.json({
    ok: true,
    message: `Password for ${user.display_name} has been reset to default (${DEFAULT_PASSWORD}).`,
    defaultPassword: DEFAULT_PASSWORD,
  });
}));

// POST /api/admin/users/:id/toggle-admin — toggle site admin privileges
router.post('/users/:id/toggle-admin', ah(async (req, res) => {
  const userId = Number(req.params.id);
  const user = await db.get('SELECT id, username, display_name, is_admin FROM users WHERE id = ?', userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const newAdmin = user.is_admin ? 0 : 1;
  await db.run('UPDATE users SET is_admin = ? WHERE id = ?', newAdmin, userId);

  res.json({
    ok: true,
    isAdmin: Boolean(newAdmin),
    message: `${user.display_name} is now ${newAdmin ? 'an Administrator' : 'a regular Member'}.`,
  });
}));

// POST /api/admin/users/:id/groups — assign user to a group
router.post('/users/:id/groups', ah(async (req, res) => {
  const userId = Number(req.params.id);
  const { groupId, role = 'member' } = req.body || {};
  if (!groupId) return res.status(400).json({ error: 'groupId is required' });

  const group = await db.get('SELECT id, name FROM groups WHERE id = ?', Number(groupId));
  if (!group) return res.status(404).json({ error: 'Group not found' });

  await db.run(
    'INSERT OR REPLACE INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
    Number(groupId), userId, role === 'admin' ? 'admin' : 'member'
  );

  res.json({ ok: true });
}));

// DELETE /api/admin/users/:id/groups/:groupId — remove user from a group
router.delete('/users/:id/groups/:groupId', ah(async (req, res) => {
  const userId = Number(req.params.id);
  const groupId = Number(req.params.groupId);

  await db.run('DELETE FROM group_members WHERE user_id = ? AND group_id = ?', userId, groupId);
  res.json({ ok: true });
}));

// GET /api/admin/groups — list clubs with member count
router.get('/groups', ah(async (_req, res) => {
  const groups = await db.all(`
    SELECT g.id, g.name, g.slug, g.created_at,
           COUNT(DISTINCT gm.user_id) AS member_count
    FROM groups g
    LEFT JOIN group_members gm ON gm.group_id = g.id
    GROUP BY g.id
    ORDER BY g.id ASC
  `);

  res.json(groups);
}));

module.exports = router;
