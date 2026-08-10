const { createClient } = require('@libsql/client');
const path = require('path');
const fs = require('fs');

// Turso (remote libSQL) in production; a local SQLite file in dev when no
// TURSO_DATABASE_URL is set, so `npm run dev` / running the server locally
// needs no external account. Same client library, same SQL dialect, either way.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
if (!process.env.TURSO_DATABASE_URL && !fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const url = process.env.TURSO_DATABASE_URL || `file:${path.join(DATA_DIR, 'movies.db')}`;
const authToken = process.env.TURSO_AUTH_TOKEN; // unused/undefined for local file mode

const client = createClient({ url, authToken });

// --- thin async helpers, mirroring the old better-sqlite3 .prepare().get/all/run shape ---
// libSQL is a network client, so every call site that used to be synchronous
// now needs `await` — these keep the call shape close to the original
// (`db.prepare(sql).get(...params)` -> `await db.get(sql, ...params)`).
async function get(sql, ...params) {
  const rs = await client.execute({ sql, args: params });
  return rs.rows[0];
}

async function all(sql, ...params) {
  const rs = await client.execute({ sql, args: params });
  return rs.rows;
}

async function run(sql, ...params) {
  const rs = await client.execute({ sql, args: params });
  return {
    changes: rs.rowsAffected,
    lastInsertRowid: rs.lastInsertRowid != null ? Number(rs.lastInsertRowid) : undefined,
  };
}

// Runs `fn(tx)` inside a libSQL interactive transaction; commits on success,
// rolls back on throw. `tx` exposes the same get/all/run shape as above.
async function transaction(fn) {
  const t = await client.transaction('write');
  const tx = {
    get: async (sql, ...params) => (await t.execute({ sql, args: params })).rows[0],
    all: async (sql, ...params) => (await t.execute({ sql, args: params })).rows,
    run: async (sql, ...params) => {
      const rs = await t.execute({ sql, args: params });
      return {
        changes: rs.rowsAffected,
        lastInsertRowid: rs.lastInsertRowid != null ? Number(rs.lastInsertRowid) : undefined,
      };
    },
  };
  try {
    const result = await fn(tx);
    await t.commit();
    return result;
  } catch (err) {
    await t.rollback();
    throw err;
  } finally {
    t.close();
  }
}

let initialized = false;

// Creates tables/views and runs migrations. Must be awaited once at startup
// before any route touches the DB (server/index.js does this before listen()).
async function init() {
  if (initialized) return;
  initialized = true;

  await client.execute('PRAGMA foreign_keys = ON');

  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS movies (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      director  TEXT    NOT NULL DEFAULT '',
      title     TEXT    NOT NULL,
      year      TEXT    DEFAULT '',
      rank_global INTEGER,
      mn        INTEGER NOT NULL DEFAULT 0,
      watchlist INTEGER NOT NULL DEFAULT 0,
      cinobo    TEXT    DEFAULT '',
      tokens    TEXT    DEFAULT '',
      token_pts INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS ratings (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      movie_id INTEGER NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
      voter    TEXT    NOT NULL,
      score    REAL    NOT NULL,
      UNIQUE(movie_id, voter)
    );

    CREATE TABLE IF NOT EXISTS top3 (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      movie_id INTEGER NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
      voter    TEXT    NOT NULL,
      rank     INTEGER NOT NULL CHECK(rank >= 1 AND rank <= 10),
      UNIQUE(movie_id, voter)
    );

    CREATE TABLE IF NOT EXISTS watchlist_votes (
      id       INTEGER PRIMARY KEY,
      movie_id INTEGER NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
      voter    TEXT    NOT NULL,
      UNIQUE(movie_id, voter)
    );
  `);

  // Migrations
  try { await client.execute("ALTER TABLE ratings ADD COLUMN comment TEXT NOT NULL DEFAULT ''"); } catch (_) {}
  try { await client.execute('ALTER TABLE movies ADD COLUMN imdb_id TEXT DEFAULT NULL'); } catch (_) {}
  try { await client.execute('ALTER TABLE movies ADD COLUMN imdb_rating REAL DEFAULT NULL'); } catch (_) {}

  // Widen top3 rank constraint 1-3 -> 1-10 (SQLite can't ALTER a CHECK, so rebuild). Idempotent.
  try {
    const t = await get("SELECT sql FROM sqlite_master WHERE type='table' AND name='top3'");
    if (t && t.sql.includes('1,2,3')) {
      await client.executeMultiple(`
        PRAGMA foreign_keys=OFF;
        CREATE TABLE top3_new (
          id       INTEGER PRIMARY KEY AUTOINCREMENT,
          movie_id INTEGER NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
          voter    TEXT    NOT NULL,
          rank     INTEGER NOT NULL CHECK(rank >= 1 AND rank <= 10),
          UNIQUE(movie_id, voter)
        );
        INSERT INTO top3_new SELECT * FROM top3;
        DROP TABLE top3;
        ALTER TABLE top3_new RENAME TO top3;
        PRAGMA foreign_keys=ON;
      `);
    }
  } catch (_) {}

  // Permanent (not TEMP) view — a remote libSQL connection isn't guaranteed to
  // reuse the same session between separate .execute() calls the way a local
  // SQLite file handle did, so TEMP VIEW (session-scoped) is unsafe here.
  // rank_bonus is inlined as plain arithmetic (was a registered JS callback
  // via better-sqlite3's db.function(), which a remote engine can't invoke).
  // Dropped and recreated on every boot (not IF NOT EXISTS) so a changed
  // GROUP_SIZE is always picked up instead of baking in a stale value forever.
  await client.execute('DROP VIEW IF EXISTS movie_scores');
  await client.execute(`
    CREATE VIEW movie_scores AS
    SELECT
      m.id, m.director, m.title, m.year,
      m.mn, m.watchlist, m.cinobo, m.tokens, m.token_pts,
      m.imdb_id, m.imdb_rating,
      r.voter_count,
      r.score_sum,
      r.fair_score,
      COALESCE(t.boost, 0)                                       AS boost,
      CASE WHEN r.voter_count >= 2
           THEN MIN(10.0, r.fair_score + COALESCE(t.boost, 0)) END        AS fair_boosted,
      CASE WHEN r.voter_count >= 2
           THEN MIN(10.0, r.score_sum / ${require('./config').GROUP_SIZE}.0 + COALESCE(t.boost, 0)) END AS boosted_score,
      r.std_dev
    FROM movies m
    LEFT JOIN (
      SELECT movie_id,
             COUNT(*)          AS voter_count,
             SUM(score)        AS score_sum,
             ROUND(AVG(score), 2) AS fair_score,
             CASE WHEN COUNT(*) >= 2
                  THEN ROUND(SQRT(AVG(score * score) - AVG(score) * AVG(score)), 2)
                  END          AS std_dev
      FROM ratings
      GROUP BY movie_id
    ) r ON r.movie_id = m.id
    LEFT JOIN (
      SELECT movie_id, SUM((11 - rank) / 10.0) AS boost
      FROM top3
      GROUP BY movie_id
    ) t ON t.movie_id = m.id
  `);
}

module.exports = { client, get, all, run, transaction, init };
