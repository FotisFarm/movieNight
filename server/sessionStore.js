// server/sessionStore.js
// Persistent session store for express-session backed by Turso / SQLite.
// Ensures user sessions survive deployments, server restarts, and container rebuilds.
const session = require('express-session');
const db = require('./db');

class TursoSessionStore extends session.Store {
  constructor(options = {}) {
    super();
    this.ttl = options.ttl || (30 * 24 * 60 * 60 * 1000); // 30 days default TTL

    // Prune expired sessions every 24 hours
    const timer = setInterval(() => this.prune(), 24 * 60 * 60 * 1000);
    if (timer.unref) timer.unref();
  }

  async get(sid, callback) {
    try {
      const now = Date.now();
      const row = await db.get('SELECT sess FROM sessions WHERE sid = ? AND expired > ?', sid, now);
      if (!row) return callback(null, null);
      const sess = JSON.parse(row.sess);
      callback(null, sess);
    } catch (err) {
      callback(err);
    }
  }

  async set(sid, sess, callback) {
    try {
      const maxAge = sess?.cookie?.maxAge ?? this.ttl;
      const expired = Date.now() + maxAge;
      const sessStr = JSON.stringify(sess);
      await db.run(
        'INSERT OR REPLACE INTO sessions (sid, sess, expired) VALUES (?, ?, ?)',
        sid, sessStr, expired
      );
      callback?.(null);
    } catch (err) {
      callback?.(err);
    }
  }

  async destroy(sid, callback) {
    try {
      await db.run('DELETE FROM sessions WHERE sid = ?', sid);
      callback?.(null);
    } catch (err) {
      callback?.(err);
    }
  }

  async touch(sid, sess, callback) {
    try {
      const maxAge = sess?.cookie?.maxAge ?? this.ttl;
      const expired = Date.now() + maxAge;
      await db.run('UPDATE sessions SET expired = ? WHERE sid = ?', expired, sid);
      callback?.(null);
    } catch (err) {
      callback?.(err);
    }
  }

  async prune() {
    try {
      await db.run('DELETE FROM sessions WHERE expired <= ?', Date.now());
    } catch (_) {}
  }
}

module.exports = TursoSessionStore;
