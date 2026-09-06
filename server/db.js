const { createClient } = require('@libsql/client');
const path = require('path');
const fs = require('fs');
const { uniqueSlug } = require('./listSlugs');

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

    CREATE TABLE IF NOT EXISTS lists (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      title       TEXT    NOT NULL,
      description TEXT    NOT NULL DEFAULT '',
      created_by  TEXT    NOT NULL DEFAULT '',
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS list_items (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      list_id  INTEGER NOT NULL REFERENCES lists(id)  ON DELETE CASCADE,
      movie_id INTEGER NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
      position INTEGER NOT NULL DEFAULT 0,
      UNIQUE(list_id, movie_id)
    );

    CREATE INDEX IF NOT EXISTS idx_list_items_list ON list_items(list_id, position);

    -- Every slug a list has ever answered to. A rename re-slugs the list (the
    -- URL should match the name on screen), and the outgoing slug is parked
    -- here so a link already shared in the group chat still resolves — it just
    -- redirects to the current one. Cascades when the list is deleted.
    CREATE TABLE IF NOT EXISTS list_slug_aliases (
      slug    TEXT    PRIMARY KEY,
      list_id INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE
    );

    -- Append-only trail of score and Top 10 changes. Never updated, never
    -- deleted except by the movie FK cascade. kind='score' rows carry a score
    -- (NULL = the rating was cleared); kind='top10' rows carry a rank
    -- (NULL = the film left that voter's Top 10). source is 'user' for
    -- anything written live and 'backfill' for rows reconstructed from the
    -- daily snapshots on the backups branch, whose changed_by is unknowable.
    CREATE TABLE IF NOT EXISTS rating_history (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      movie_id   INTEGER NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
      voter      TEXT    NOT NULL,
      kind       TEXT    NOT NULL DEFAULT 'score',
      score      REAL,
      rank       INTEGER,
      changed_by TEXT    NOT NULL DEFAULT '',
      source     TEXT    NOT NULL DEFAULT 'user',
      changed_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_rating_history ON rating_history(movie_id, voter, changed_at);
    CREATE INDEX IF NOT EXISTS idx_rating_history_when ON rating_history(changed_at);
  `);

  // Migrations
  try { await client.execute("ALTER TABLE ratings ADD COLUMN comment TEXT NOT NULL DEFAULT ''"); } catch (_) {}
  try { await client.execute('ALTER TABLE movies ADD COLUMN imdb_id TEXT DEFAULT NULL'); } catch (_) {}
  try { await client.execute('ALTER TABLE movies ADD COLUMN imdb_rating REAL DEFAULT NULL'); } catch (_) {}
  // TMDB poster path (e.g. '/3bhkrj58Vtu7enYsRolD1fZdja1.jpg'), not a full
  // URL — the width is chosen at render time. See server/tmdb.js.
  try { await client.execute('ALTER TABLE movies ADD COLUMN poster_path TEXT DEFAULT NULL'); } catch (_) {}
  // Film duration in minutes (from TMDB/OMDb)
  try { await client.execute('ALTER TABLE movies ADD COLUMN runtime INTEGER DEFAULT NULL'); } catch (_) {}
  await backfillInitialRuntimes();
  // Letterboxd rating (5-star scale with 2 decimals)
  try { await client.execute('ALTER TABLE movies ADD COLUMN letterboxd_rating REAL DEFAULT NULL'); } catch (_) {}
  await backfillInitialLetterboxd();

  // Readable list URLs (/lists/christougenna-2026). The column is added
  // nullable — SQLite can't add a UNIQUE column — then every list without one
  // is slugged below, so lists created before this migration keep working.
  try { await client.execute('ALTER TABLE lists ADD COLUMN slug TEXT DEFAULT NULL'); } catch (_) {}
  await client.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_lists_slug ON lists(slug)');
  await backfillListSlugs();

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
      m.imdb_id, m.imdb_rating, m.letterboxd_rating, m.poster_path, m.runtime,
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

// Give every list a slug — lists created before the slug column existed have
// NULL, and so would 404 under the new /lists/:slug routing.
async function backfillListSlugs() {
  const rows = await all("SELECT id, title FROM lists WHERE slug IS NULL OR slug = ''");
  for (const row of rows) {
    const slug = await uniqueSlug({ get }, row.title, row.id);
    await run('UPDATE lists SET slug = ? WHERE id = ?', slug, row.id);
  }
}

// Backfill initial movie runtimes from bundled dataset if not already populated.
async function backfillInitialRuntimes() {
  try {
    const row = await get('SELECT COUNT(runtime) AS c FROM movies WHERE runtime IS NOT NULL');
    if (row && Number(row.c) >= 500) {
      console.log(`[db] Movie runtimes already populated (${row.c} films).`);
      return;
    }

    // Require directly so Docker volume mounts on /app/data never shadow this file
    let data;
    try {
      data = require('./initial-runtimes.json');
    } catch (_) {
      try {
        data = require('./data/initial-runtimes.json');
      } catch (e) {
        console.warn('[db] Could not load initial-runtimes.json:', e.message);
        return;
      }
    }

    const entries = Object.entries(data);
    console.log(`[db] Backfilling ${entries.length} movie runtimes into database...`);

    // Use CASE statements in chunks of 100 for maximum speed and compatibility
    const CHUNK = 100;
    for (let i = 0; i < entries.length; i += CHUNK) {
      const slice = entries.slice(i, i + CHUNK);
      const whenClauses = slice.map(([id, rt]) => `WHEN ${parseInt(id, 10)} THEN ${parseInt(rt, 10)}`).join(' ');
      const ids = slice.map(([id]) => parseInt(id, 10)).join(',');
      const sql = `UPDATE movies SET runtime = CASE id ${whenClauses} END WHERE id IN (${ids}) AND (runtime IS NULL OR runtime = 0)`;
      await run(sql);
    }
    const after = await get('SELECT COUNT(runtime) AS c FROM movies WHERE runtime IS NOT NULL');
    console.log(`[db] Movie runtimes backfilled successfully. Total with runtime: ${after?.c}`);
  } catch (err) {
    console.warn('[db] Note: backfillInitialRuntimes notice:', err.message);
  }
}

async function backfillInitialLetterboxd() {
  try {
    const existing = await get('SELECT COUNT(letterboxd_rating) AS c FROM movies WHERE letterboxd_rating IS NOT NULL');
    if (existing?.c > 0) return;

    let data;
    try {
      data = require('./data/initial-letterboxd.json');
    } catch (_) {
      try {
        data = require('./initial-letterboxd.json');
      } catch (e) {
        return;
      }
    }

    const entries = Object.entries(data).filter(([_, s]) => s != null && s !== '');
    if (!entries.length) return;
    console.log(`[db] Backfilling ${entries.length} Letterboxd ratings into database...`);

    const CHUNK = 100;
    for (let i = 0; i < entries.length; i += CHUNK) {
      const slice = entries.slice(i, i + CHUNK);
      const whenClauses = slice.map(([id, s]) => `WHEN ${parseInt(id, 10)} THEN ${Number(s)}`).join(' ');
      const ids = slice.map(([id]) => parseInt(id, 10)).join(',');
      const sql = `UPDATE movies SET letterboxd_rating = CASE id ${whenClauses} END WHERE id IN (${ids}) AND letterboxd_rating IS NULL`;
      await run(sql);
    }
    const after = await get('SELECT COUNT(letterboxd_rating) AS c FROM movies WHERE letterboxd_rating IS NOT NULL');
    console.log(`[db] Letterboxd ratings backfilled successfully. Total with letterboxd_rating: ${after?.c}`);
  } catch (err) {
    console.warn('[db] Note: backfillInitialLetterboxd notice:', err.message);
  }
}

module.exports = { client, get, all, run, transaction, init };
