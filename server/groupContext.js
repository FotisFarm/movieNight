const db = require('./db');
const { VOTERS, GROUP_SIZE, MIN_VOTERS } = require('./config');

const DEFAULT_GROUP = {
  id: 1,
  name: 'The Originals',
  slug: 'the-originals',
  voters: VOTERS,
  members: VOTERS.map((v, i) => ({ id: i + 1, username: v, displayName: v, role: v === 'Φώτης' ? 'admin' : 'member' })),
  groupSize: GROUP_SIZE,
  minVoters: MIN_VOTERS,
};

async function getGroupWithMembers(groupIdOrSlug) {
  try {
    let group = null;
    if (typeof groupIdOrSlug === 'number' || /^\d+$/.test(String(groupIdOrSlug))) {
      group = await db.get('SELECT id, name, slug FROM groups WHERE id = ?', Number(groupIdOrSlug));
    } else if (typeof groupIdOrSlug === 'string' && groupIdOrSlug.trim()) {
      group = await db.get('SELECT id, name, slug FROM groups WHERE slug = ?', groupIdOrSlug.trim());
    }

    if (!group) {
      group = await db.get('SELECT id, name, slug FROM groups ORDER BY id ASC LIMIT 1');
    }

    if (!group) {
      return DEFAULT_GROUP;
    }

    const memberRows = await db.all(`
      SELECT gm.id, gm.role, u.id AS user_id, u.username, u.display_name
      FROM group_members gm
      JOIN users u ON u.id = gm.user_id
      WHERE gm.group_id = ?
      ORDER BY gm.id ASC
    `, group.id);

    const voters = memberRows.map(m => m.display_name);
    const size = voters.length || 1;

    return {
      id: group.id,
      name: group.name,
      slug: group.slug,
      voters,
      members: memberRows.map(m => ({
        id: m.user_id,
        username: m.username,
        displayName: m.display_name,
        role: m.role,
      })),
      groupSize: size,
      minVoters: Math.min(2, size),
    };
  } catch (err) {
    console.warn('[groupContext] Error resolving group:', err.message);
    return DEFAULT_GROUP;
  }
}

async function getUserGroups(userId) {
  try {
    if (!userId) return [];
    return await db.all(`
      SELECT g.id, g.name, g.slug, gm.role
      FROM groups g
      JOIN group_members gm ON gm.group_id = g.id
      WHERE gm.user_id = ?
      ORDER BY g.id ASC
    `, userId);
  } catch (err) {
    console.warn('[groupContext] Error fetching user groups:', err.message);
    return [];
  }
}

async function getAllVoters() {
  try {
    return await db.all(`
      SELECT id, username, display_name, is_admin
      FROM users
      WHERE username != 'mnAdmin'
      ORDER BY display_name COLLATE NOCASE ASC
    `);
  } catch (err) {
    console.warn('[groupContext] Error fetching all voters:', err.message);
    return VOTERS.map((v, i) => ({ id: i + 1, username: v, display_name: v, is_admin: v === 'Φώτης' ? 1 : 0 }));
  }
}

async function attachGroupContext(req, _res, next) {
  try {
    if (req.session?.voter && !req.session?.userId) {
      const user = await db.get(
        'SELECT id, username, display_name, is_admin FROM users WHERE display_name = ? OR username = ?',
        req.session.voter, req.session.voter
      );
      if (user) {
        req.session.userId = user.id;
        req.session.username = user.username;
        req.session.displayName = user.display_name;
        req.session.isAdmin = !!user.is_admin;
      }
    }

    let targetGroupId = req.session?.activeGroupId;

    if (!targetGroupId && req.session?.userId) {
      const userGroups = await getUserGroups(req.session.userId);
      if (userGroups.length > 0) {
        targetGroupId = userGroups[0].id;
        req.session.activeGroupId = targetGroupId;
      }
    }

    req.group = await getGroupWithMembers(targetGroupId || 1);
  } catch (err) {
    console.warn('[groupContext] Middleware warning:', err.message);
    req.group = DEFAULT_GROUP;
  }
  if (typeof next === 'function') next();
}

module.exports = {
  getGroupWithMembers,
  getUserGroups,
  getAllVoters,
  attachGroupContext,
  DEFAULT_GROUP,
};
