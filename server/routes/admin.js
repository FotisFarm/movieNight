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

  const allGroups = await db.all('SELECT id, name, slug FROM groups ORDER BY id ASC');
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
    groups: u.username === 'mnAdmin'
      ? allGroups.map(g => ({ id: g.id, name: g.name, slug: g.slug, role: 'admin' }))
      : memberships
          .filter(m => m.user_id === u.id)
          .map(m => ({ id: m.group_id, name: m.group_name, slug: m.group_slug, role: m.role })),
  }));

  res.json(enriched);
}));

// POST /api/admin/users — create a new user & assign to club
router.post('/users', ah(async (req, res) => {
  const { username, displayName, groupId, isAdmin = false, groupRole = 'member', password } = req.body || {};

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
    const role = (adminFlag || groupRole === 'admin') ? 'admin' : 'member';
    await db.run(
      'INSERT OR IGNORE INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
      Number(groupId), newUserId, role
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

// PUT /api/admin/users/:id/groups — replace all group memberships for a user
router.put('/users/:id/groups', ah(async (req, res) => {
  const userId = Number(req.params.id);
  const { groupIds = [], roles = {}, memberships = [] } = req.body || {};

  const user = await db.get('SELECT id, username, display_name FROM users WHERE id = ?', userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (user.username === 'mnAdmin') {
    return res.json({ ok: true, message: 'System administrator has global access to all clubs without affecting voter counts' });
  }

  const targetMemberships = Array.isArray(memberships) && memberships.length > 0
    ? memberships
    : groupIds.map(gid => ({
        groupId: Number(gid),
        role: roles[gid] === 'admin' ? 'admin' : 'member',
      }));

  await db.run('DELETE FROM group_members WHERE user_id = ?', userId);
  for (const m of targetMemberships) {
    const gid = Number(m.groupId || m.id);
    const role = m.role === 'admin' ? 'admin' : 'member';
    if (gid) {
      await db.run(
        'INSERT OR REPLACE INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
        gid, userId, role
      );
    }
  }

  res.json({ ok: true, message: `Updated clubs for ${user.display_name}` });
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

// PATCH /api/admin/groups/:id — rename / update a movie club
router.patch('/groups/:id', ah(async (req, res) => {
  const groupId = Number(req.params.id);
  if (!groupId || isNaN(groupId)) {
    return res.status(400).json({ error: 'Valid group ID is required' });
  }

  const { name, slug: customSlug } = req.body || {};
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Group name is required' });
  }

  const existing = await db.get('SELECT * FROM groups WHERE id = ?', groupId);
  if (!existing) {
    return res.status(404).json({ error: 'Group not found' });
  }

  const trimmedName = name.trim();
  let slug = existing.slug;

  if (customSlug && typeof customSlug === 'string' && customSlug.trim()) {
    slug = customSlug.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!slug) slug = existing.slug;
    const conflict = await db.get('SELECT id FROM groups WHERE LOWER(slug) = LOWER(?) AND id != ?', slug, groupId);
    if (conflict) {
      return res.status(409).json({ error: 'A group with this slug already exists' });
    }
  }

  await db.run('UPDATE groups SET name = ?, slug = ? WHERE id = ?', trimmedName, slug, groupId);

  // If current session's active group was renamed, update it in session
  if (req.session && req.session.activeGroupId === groupId) {
    req.session.activeGroupName = trimmedName;
    req.session.activeGroupSlug = slug;
  }

  const updated = await db.get(`
    SELECT g.id, g.name, g.slug, g.created_at,
           COUNT(DISTINCT gm.user_id) AS member_count
    FROM groups g
    LEFT JOIN group_members gm ON gm.group_id = g.id
    WHERE g.id = ?
    GROUP BY g.id
  `, groupId);

  res.json({ ok: true, group: updated });
}));

// GET /api/admin/sessions — list active database sessions
router.get('/sessions', ah(async (req, res) => {
  const now = Date.now();
  const rows = await db.all('SELECT sid, sess, expired FROM sessions WHERE expired > ? ORDER BY expired DESC', now);
  const expiredCountRow = await db.get('SELECT COUNT(*) AS c FROM sessions WHERE expired <= ?', now);

  const currentSid = req.sessionID;
  const sessions = [];
  const uniqueUsers = new Set();

  for (const row of rows) {
    try {
      const data = JSON.parse(row.sess);
      const displayName = data.displayName || data.voter || 'Guest';
      const username = data.username || data.voter || 'unknown';
      if (data.userId) uniqueUsers.add(data.userId);

      sessions.push({
        sid: row.sid,
        maskedSid: row.sid.length > 12 ? `${row.sid.slice(0, 6)}...${row.sid.slice(-4)}` : row.sid,
        userId: data.userId || null,
        username,
        displayName,
        isAdmin: Boolean(data.isAdmin),
        activeGroupId: data.activeGroupId || 1,
        activeGroupName: data.activeGroupName || 'The Originals',
        expiresAt: row.expired,
        isCurrentDevice: row.sid === currentSid,
      });
    } catch (_) {}
  }

  res.json({
    sessions,
    stats: {
      totalActive: sessions.length,
      totalExpired: Number(expiredCountRow?.c || 0),
      uniqueUsersCount: uniqueUsers.size,
    },
  });
}));

// DELETE /api/admin/sessions/:sid — terminate a single session
router.delete('/sessions/:sid', ah(async (req, res) => {
  const sid = req.params.sid;
  await db.run('DELETE FROM sessions WHERE sid = ?', sid);
  res.json({ ok: true, message: 'Session revoked successfully' });
}));

// POST /api/admin/sessions/prune — delete all expired sessions from database
router.post('/sessions/prune', ah(async (_req, res) => {
  const now = Date.now();
  const result = await db.run('DELETE FROM sessions WHERE expired <= ?', now);
  res.json({ ok: true, prunedCount: result.changes || 0 });
}));

// POST /api/admin/users/:id/revoke-sessions — terminate all sessions for a specific user
router.post('/users/:id/revoke-sessions', ah(async (req, res) => {
  const userId = Number(req.params.id);
  const rows = await db.all('SELECT sid, sess FROM sessions');
  let revokedCount = 0;
  for (const row of rows) {
    try {
      const data = JSON.parse(row.sess);
      if (data.userId === userId) {
        await db.run('DELETE FROM sessions WHERE sid = ?', row.sid);
        revokedCount++;
      }
    } catch (_) {}
  }
  res.json({ ok: true, revokedCount });
}));

// GET /api/admin/letterboxd-sync/status — check background sync status

router.get('/letterboxd-sync/status', ah(async (_req, res) => {
  const { getSyncStatus } = require('../letterboxdSync');
  const status = getSyncStatus();
  const summary = await db.get(`
    SELECT COUNT(*) AS total,
           COUNT(imdb_id) AS with_imdb,
           COUNT(letterboxd_rating) AS with_rating,
           COUNT(letterboxd_updated_at) AS with_updated_at,
           COUNT(CASE WHEN letterboxd_updated_at >= datetime('now', '-24 hours') THEN 1 END) AS synced_last_24h
    FROM movies
  `);
  res.json({ ok: true, sync: status, catalog: summary });
}));

// POST /api/admin/letterboxd-sync/run — trigger manual background sync
router.post('/letterboxd-sync/run', ah(async (req, res) => {
  const { forceAll = false } = req.body || {};
  const { runLetterboxdSync, getSyncStatus } = require('../letterboxdSync');
  const current = getSyncStatus();
  if (current.isRunning) {
    return res.json({ ok: false, message: 'Sync already running', status: current });
  }

  // Launch async without awaiting completion so admin response is immediate
  runLetterboxdSync({ forceAll }).catch(err => console.error('[admin] Sync run error:', err));

  res.json({ ok: true, message: 'Letterboxd sync started in background', forceAll });
}));

// POST /api/admin/letterboxd-sync/stop — cancel running sync
router.post('/letterboxd-sync/stop', ah(async (_req, res) => {
  const { stopLetterboxdSync } = require('../letterboxdSync');
  const result = stopLetterboxdSync();
  res.json(result);
}));

module.exports = router;

