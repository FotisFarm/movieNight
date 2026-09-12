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

const { hashPassword } = require('./auth-crypto');

const { SANDBOX_MODE, GROUP_SIZE } = require('./config');

const SANDBOX_PREFIX = 'sandbox_';
const EFFECTIVE_PREFIX = 'v6_effective_';

// Rewrites table names when operating in sandbox mode:
// - Write queries (INSERT, UPDATE, DELETE) targeting ratings/top3/watchlist_votes/rating_history
//   are routed to sandbox_* tables, leaving production data completely immutable.
// - Read queries (SELECT, WITH, subqueries) targeting ratings/top3/watchlist_votes/rating_history/movie_scores
//   are routed to v6_effective_* views, unioning live prod data with sandbox data.
function rewriteSql(sql) {
  if (!SANDBOX_MODE || typeof sql !== 'string') return sql;
  const trimmed = sql.trim();

  // If this is a write query (INSERT, UPDATE, DELETE) targeting ratings, top3, watchlist_votes, rating_history:
  if (/^(INSERT|UPDATE|DELETE)\b/i.test(trimmed)) {
    return sql
      .replace(/\bINSERT\s+(OR\s+\w+\s+)?INTO\s+["']?ratings["']?\b/gi, `INSERT $1INTO ${SANDBOX_PREFIX}ratings`)
      .replace(/\bINSERT\s+(OR\s+\w+\s+)?INTO\s+["']?top3["']?\b/gi, `INSERT $1INTO ${SANDBOX_PREFIX}top3`)
      .replace(/\bINSERT\s+(OR\s+\w+\s+)?INTO\s+["']?watchlist_votes["']?\b/gi, `INSERT $1INTO ${SANDBOX_PREFIX}watchlist_votes`)
      .replace(/\bINSERT\s+(OR\s+\w+\s+)?INTO\s+["']?rating_history["']?\b/gi, `INSERT $1INTO ${SANDBOX_PREFIX}rating_history`)
      .replace(/\bUPDATE\s+["']?ratings["']?\b/gi, `UPDATE ${SANDBOX_PREFIX}ratings`)
      .replace(/\bUPDATE\s+["']?top3["']?\b/gi, `UPDATE ${SANDBOX_PREFIX}top3`)
      .replace(/\bUPDATE\s+["']?watchlist_votes["']?\b/gi, `UPDATE ${SANDBOX_PREFIX}watchlist_votes`)
      .replace(/\bUPDATE\s+["']?rating_history["']?\b/gi, `UPDATE ${SANDBOX_PREFIX}rating_history`)
      .replace(/\bDELETE\s+FROM\s+["']?ratings["']?\b/gi, `DELETE FROM ${SANDBOX_PREFIX}ratings`)
      .replace(/\bDELETE\s+FROM\s+["']?top3["']?\b/gi, `DELETE FROM ${SANDBOX_PREFIX}top3`)
      .replace(/\bDELETE\s+FROM\s+["']?watchlist_votes["']?\b/gi, `DELETE FROM ${SANDBOX_PREFIX}watchlist_votes`)
      .replace(/\bDELETE\s+FROM\s+["']?rating_history["']?\b/gi, `DELETE FROM ${SANDBOX_PREFIX}rating_history`);
  }

  // Read queries (SELECT, WITH, PRAGMA, subqueries):
  return sql
    .replace(/\b(FROM|JOIN)\s+["']?movies["']?\b/gi, `$1 ${EFFECTIVE_PREFIX}movies`)
    .replace(/\b(FROM|JOIN)\s+["']?ratings["']?\b/gi, `$1 ${EFFECTIVE_PREFIX}ratings`)
    .replace(/\b(FROM|JOIN)\s+["']?top3["']?\b/gi, `$1 ${EFFECTIVE_PREFIX}top3`)
    .replace(/\b(FROM|JOIN)\s+["']?watchlist_votes["']?\b/gi, `$1 ${EFFECTIVE_PREFIX}watchlist_votes`)
    .replace(/\b(FROM|JOIN)\s+["']?movie_scores["']?\b/gi, `$1 v6_movie_scores`)
    .replace(/\b(FROM|JOIN)\s+["']?lists["']?\b/gi, `$1 ${EFFECTIVE_PREFIX}lists`)
    .replace(/\b(FROM|JOIN)\s+["']?list_items["']?\b/gi, `$1 ${EFFECTIVE_PREFIX}list_items`)
    .replace(/\b(FROM|JOIN)\s+["']?list_slug_aliases["']?\b/gi, `$1 ${EFFECTIVE_PREFIX}list_slug_aliases`);
}

// --- thin async helpers, mirroring the old better-sqlite3 .prepare().get/all/run shape ---
// libSQL is a network client, so every call site that used to be synchronous
// now needs `await` — these keep the call shape close to the original
// (`db.prepare(sql).get(...params)` -> `await db.get(sql, ...params)`).
async function get(sql, ...params) {
  const rs = await client.execute({ sql: rewriteSql(sql), args: params });
  return rs.rows[0];
}

async function all(sql, ...params) {
  const rs = await client.execute({ sql: rewriteSql(sql), args: params });
  return rs.rows;
}

async function run(sql, ...params) {
  const rs = await client.execute({ sql: rewriteSql(sql), args: params });
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
    get: async (sql, ...params) => (await t.execute({ sql: rewriteSql(sql), args: params })).rows[0],
    all: async (sql, ...params) => (await t.execute({ sql: rewriteSql(sql), args: params })).rows,
    run: async (sql, ...params) => {
      const rs = await t.execute({ sql: rewriteSql(sql), args: params });
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

    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT    NOT NULL COLLATE NOCASE UNIQUE,
      display_name  TEXT    NOT NULL,
      password_hash TEXT    NOT NULL,
      is_admin      INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS groups (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL,
      slug       TEXT    NOT NULL COLLATE NOCASE UNIQUE,
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS group_members (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id   INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role       TEXT    NOT NULL DEFAULT 'member',
      created_at TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(group_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS group_movie_status (
      group_id  INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      movie_id  INTEGER NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
      mn        INTEGER NOT NULL DEFAULT 0,
      watchlist INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (group_id, movie_id)
    );

    CREATE TABLE IF NOT EXISTS group_watchlist_votes (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id  INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      movie_id  INTEGER NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
      user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(group_id, movie_id, user_id)
    );
  `);

  // Migrations
  try { await client.execute("ALTER TABLE ratings ADD COLUMN comment TEXT NOT NULL DEFAULT ''"); } catch (_) {}
  try { await client.execute('ALTER TABLE ratings ADD COLUMN user_id INTEGER REFERENCES users(id)'); } catch (_) {}
  try { await client.execute('ALTER TABLE top3 ADD COLUMN user_id INTEGER REFERENCES users(id)'); } catch (_) {}
  try { await client.execute('ALTER TABLE lists ADD COLUMN group_id INTEGER REFERENCES groups(id)'); } catch (_) {}
  try { await client.execute('ALTER TABLE movies ADD COLUMN imdb_id TEXT DEFAULT NULL'); } catch (_) {}
  try { await client.execute('ALTER TABLE movies ADD COLUMN imdb_rating REAL DEFAULT NULL'); } catch (_) {}
  // TMDB poster path (e.g. '/3bhkrj58Vtu7enYsRolD1fZdja1.jpg'), not a full
  // URL — the width is chosen at render time. See server/tmdb.js.
  try { await client.execute('ALTER TABLE movies ADD COLUMN poster_path TEXT DEFAULT NULL'); } catch (_) {}
  // Film duration in minutes (from TMDB/OMDb)
  try { await client.execute('ALTER TABLE movies ADD COLUMN runtime INTEGER DEFAULT NULL'); } catch (_) {}
  // Letterboxd rating (5-star scale with 2 decimals)
  try { await client.execute('ALTER TABLE movies ADD COLUMN letterboxd_rating REAL DEFAULT NULL'); } catch (_) {}

  // Readable list URLs (/lists/christougenna-2026). The column is added
  // nullable — SQLite can't add a UNIQUE column — then every list without one
  // is slugged below, so lists created before this migration keep working.
  try { await client.execute('ALTER TABLE lists ADD COLUMN slug TEXT DEFAULT NULL'); } catch (_) {}
  await client.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_lists_slug ON lists(slug)');

  await initMultiGroup();

  if (!SANDBOX_MODE) {
    await backfillInitialRuntimes();
    await backfillInitialLetterboxd();
    await backfillListSlugs();
  }

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

  if (SANDBOX_MODE) {
    // In sandbox mode: ensure sandbox tables exist and update effective union views.
    // Base production tables (movies, ratings, lists, etc.) are completely untouched.

    // Ensure sandbox tables don't enforce foreign keys against the live movies table
    // (so sandbox movies with id >= 1,000,000 can have ratings, comments, top3, etc.).
    try {
      const t = await client.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='sandbox_ratings'");
      if (t?.rows?.[0]?.sql && t.rows[0].sql.includes('REFERENCES movies')) {
        await client.executeMultiple(`
          PRAGMA foreign_keys=OFF;
          CREATE TABLE IF NOT EXISTS sandbox_ratings_new (
            id       INTEGER PRIMARY KEY AUTOINCREMENT,
            movie_id INTEGER NOT NULL,
            voter    TEXT    NOT NULL,
            score    REAL    NOT NULL,
            comment  TEXT    NOT NULL DEFAULT '',
            UNIQUE(movie_id, voter)
          );
          INSERT INTO sandbox_ratings_new SELECT * FROM sandbox_ratings;
          DROP TABLE sandbox_ratings;
          ALTER TABLE sandbox_ratings_new RENAME TO sandbox_ratings;

          CREATE TABLE IF NOT EXISTS sandbox_top3_new (
            id       INTEGER PRIMARY KEY AUTOINCREMENT,
            movie_id INTEGER NOT NULL,
            voter    TEXT    NOT NULL,
            rank     INTEGER NOT NULL CHECK(rank >= 1 AND rank <= 10),
            UNIQUE(movie_id, voter)
          );
          INSERT INTO sandbox_top3_new SELECT * FROM sandbox_top3;
          DROP TABLE sandbox_top3;
          ALTER TABLE sandbox_top3_new RENAME TO sandbox_top3;

          CREATE TABLE IF NOT EXISTS sandbox_watchlist_votes_new (
            id       INTEGER PRIMARY KEY,
            movie_id INTEGER NOT NULL,
            voter    TEXT    NOT NULL,
            UNIQUE(movie_id, voter)
          );
          INSERT INTO sandbox_watchlist_votes_new SELECT * FROM sandbox_watchlist_votes;
          DROP TABLE sandbox_watchlist_votes;
          ALTER TABLE sandbox_watchlist_votes_new RENAME TO sandbox_watchlist_votes;

          CREATE TABLE IF NOT EXISTS sandbox_rating_history_new (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            movie_id   INTEGER NOT NULL,
            voter      TEXT    NOT NULL,
            kind       TEXT    NOT NULL DEFAULT 'score',
            score      REAL,
            rank       INTEGER,
            changed_by TEXT    NOT NULL DEFAULT '',
            source     TEXT    NOT NULL DEFAULT 'user',
            changed_at TEXT    NOT NULL DEFAULT (datetime('now'))
          );
          INSERT INTO sandbox_rating_history_new SELECT * FROM sandbox_rating_history;
          DROP TABLE sandbox_rating_history;
          ALTER TABLE sandbox_rating_history_new RENAME TO sandbox_rating_history;
          CREATE INDEX IF NOT EXISTS idx_sandbox_rating_history ON sandbox_rating_history(movie_id, voter, changed_at);

          CREATE TABLE IF NOT EXISTS sandbox_watchlist_overrides_new (
            movie_id  INTEGER PRIMARY KEY,
            watchlist INTEGER NOT NULL
          );
          INSERT INTO sandbox_watchlist_overrides_new SELECT * FROM sandbox_watchlist_overrides;
          DROP TABLE sandbox_watchlist_overrides;
          ALTER TABLE sandbox_watchlist_overrides_new RENAME TO sandbox_watchlist_overrides;

          PRAGMA foreign_keys=ON;
        `);
      }
    } catch (e) {
      console.warn('[db] FK migration warning:', e.message);
    }

    await client.executeMultiple(`
      CREATE TABLE IF NOT EXISTS sandbox_ratings (
        id       INTEGER PRIMARY KEY AUTOINCREMENT,
        movie_id INTEGER NOT NULL,
        voter    TEXT    NOT NULL,
        score    REAL    NOT NULL,
        comment  TEXT    NOT NULL DEFAULT '',
        UNIQUE(movie_id, voter)
      );

      CREATE TABLE IF NOT EXISTS sandbox_top3 (
        id       INTEGER PRIMARY KEY AUTOINCREMENT,
        movie_id INTEGER NOT NULL,
        voter    TEXT    NOT NULL,
        rank     INTEGER NOT NULL CHECK(rank >= 1 AND rank <= 10),
        UNIQUE(movie_id, voter)
      );

      CREATE TABLE IF NOT EXISTS sandbox_watchlist_votes (
        id       INTEGER PRIMARY KEY,
        movie_id INTEGER NOT NULL,
        voter    TEXT    NOT NULL,
        UNIQUE(movie_id, voter)
      );

      CREATE TABLE IF NOT EXISTS sandbox_watchlist_overrides (
        movie_id  INTEGER PRIMARY KEY,
        watchlist INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sandbox_rating_history (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        movie_id   INTEGER NOT NULL,
        voter      TEXT    NOT NULL,
        kind       TEXT    NOT NULL DEFAULT 'score',
        score      REAL,
        rank       INTEGER,
        changed_by TEXT    NOT NULL DEFAULT '',
        source     TEXT    NOT NULL DEFAULT 'user',
        changed_at TEXT    NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_sandbox_rating_history ON sandbox_rating_history(movie_id, voter, changed_at);

      CREATE TABLE IF NOT EXISTS sandbox_movies (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        director          TEXT    NOT NULL DEFAULT '',
        title             TEXT    NOT NULL,
        year              TEXT    DEFAULT '',
        rank_global       INTEGER,
        mn                INTEGER NOT NULL DEFAULT 0,
        watchlist         INTEGER NOT NULL DEFAULT 0,
        cinobo            TEXT    DEFAULT '',
        tokens            TEXT    DEFAULT '',
        token_pts         INTEGER NOT NULL DEFAULT 0,
        imdb_id           TEXT    DEFAULT NULL,
        imdb_rating       REAL    DEFAULT NULL,
        poster_path       TEXT    DEFAULT NULL,
        runtime           INTEGER DEFAULT NULL,
        letterboxd_rating REAL    DEFAULT NULL
      );

      CREATE TABLE IF NOT EXISTS sandbox_lists (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        title       TEXT    NOT NULL,
        description TEXT    NOT NULL DEFAULT '',
        created_by  TEXT    NOT NULL DEFAULT '',
        created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
        slug        TEXT    DEFAULT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_sandbox_lists_slug ON sandbox_lists(slug);

      CREATE TABLE IF NOT EXISTS sandbox_list_items (
        id       INTEGER PRIMARY KEY AUTOINCREMENT,
        list_id  INTEGER NOT NULL REFERENCES sandbox_lists(id) ON DELETE CASCADE,
        movie_id INTEGER NOT NULL,
        position INTEGER NOT NULL DEFAULT 0,
        UNIQUE(list_id, movie_id)
      );
      CREATE INDEX IF NOT EXISTS idx_sandbox_list_items_list ON sandbox_list_items(list_id, position);

      CREATE TABLE IF NOT EXISTS sandbox_list_slug_aliases (
        slug    TEXT    PRIMARY KEY,
        list_id INTEGER NOT NULL REFERENCES sandbox_lists(id) ON DELETE CASCADE
      );

      INSERT INTO sqlite_sequence (name, seq)
      SELECT 'sandbox_movies', 1000000
      WHERE NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = 'sandbox_movies');

      INSERT INTO sqlite_sequence (name, seq)
      SELECT 'sandbox_lists', 1000000
      WHERE NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = 'sandbox_lists');

      DROP VIEW IF EXISTS v6_effective_movies;
      CREATE VIEW v6_effective_movies AS
      SELECT
        m.id, m.director, m.title, m.year,
        m.rank_global, m.mn,
        COALESCE(s.watchlist, m.watchlist) AS watchlist,
        m.cinobo, m.tokens, m.token_pts,
        m.imdb_id, m.imdb_rating, m.letterboxd_rating, m.poster_path, m.runtime
      FROM movies m
      LEFT JOIN sandbox_watchlist_overrides s ON s.movie_id = m.id
      UNION ALL
      SELECT
        sm.id, sm.director, sm.title, sm.year,
        sm.rank_global, sm.mn,
        COALESCE(s.watchlist, sm.watchlist) AS watchlist,
        sm.cinobo, sm.tokens, sm.token_pts,
        sm.imdb_id, sm.imdb_rating, sm.letterboxd_rating, sm.poster_path, sm.runtime
      FROM sandbox_movies sm
      LEFT JOIN sandbox_watchlist_overrides s ON s.movie_id = sm.id;

      DROP VIEW IF EXISTS v6_effective_ratings;
      CREATE VIEW v6_effective_ratings AS
      SELECT r.id, r.movie_id, r.voter, r.score, r.comment
      FROM ratings r
      WHERE NOT EXISTS (
        SELECT 1 FROM sandbox_ratings s WHERE s.movie_id = r.movie_id AND s.voter = r.voter
      )
      UNION ALL
      SELECT s.id, s.movie_id, s.voter, s.score, s.comment
      FROM sandbox_ratings s;

      DROP VIEW IF EXISTS v6_effective_top3;
      CREATE VIEW v6_effective_top3 AS
      SELECT t.id, t.movie_id, t.voter, t.rank
      FROM top3 t
      WHERE NOT EXISTS (
        SELECT 1 FROM sandbox_top3 s WHERE s.movie_id = t.movie_id AND s.voter = t.voter
      )
      UNION ALL
      SELECT s.id, s.movie_id, s.voter, s.rank
      FROM sandbox_top3 s;

      DROP VIEW IF EXISTS v6_effective_watchlist_votes;
      CREATE VIEW v6_effective_watchlist_votes AS
      SELECT w.id, w.movie_id, w.voter
      FROM watchlist_votes w
      WHERE NOT EXISTS (
        SELECT 1 FROM sandbox_watchlist_votes s WHERE s.movie_id = w.movie_id AND s.voter = w.voter
      )
      UNION ALL
      SELECT s.id, s.movie_id, s.voter
      FROM sandbox_watchlist_votes s;

      DROP VIEW IF EXISTS v6_effective_rating_history;
      CREATE VIEW v6_effective_rating_history AS
      SELECT id, movie_id, voter, kind, score, rank, changed_by, source, changed_at
      FROM rating_history
      UNION ALL
      SELECT id, movie_id, voter, kind, score, rank, changed_by, source, changed_at
      FROM sandbox_rating_history;

      DROP VIEW IF EXISTS v6_effective_lists;
      CREATE VIEW v6_effective_lists AS
      SELECT id, title, description, created_by, created_at, slug
      FROM lists
      UNION ALL
      SELECT id, title, description, created_by, created_at, slug
      FROM sandbox_lists;

      DROP VIEW IF EXISTS v6_effective_list_items;
      CREATE VIEW v6_effective_list_items AS
      SELECT id, list_id, movie_id, position
      FROM list_items
      UNION ALL
      SELECT id, list_id, movie_id, position
      FROM sandbox_list_items;

      DROP VIEW IF EXISTS v6_effective_list_slug_aliases;
      CREATE VIEW v6_effective_list_slug_aliases AS
      SELECT slug, list_id
      FROM list_slug_aliases
      UNION ALL
      SELECT slug, list_id
      FROM sandbox_list_slug_aliases;

      DROP VIEW IF EXISTS v6_movie_scores;
      CREATE VIEW v6_movie_scores AS
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
             THEN MIN(10.0, r.score_sum / ${GROUP_SIZE}.0 + COALESCE(t.boost, 0)) END AS boosted_score,
        r.std_dev
      FROM v6_effective_movies m
      LEFT JOIN (
        SELECT movie_id,
               COUNT(*)          AS voter_count,
               SUM(score)        AS score_sum,
               ROUND(AVG(score), 2) AS fair_score,
               CASE WHEN COUNT(*) >= 2
                    THEN ROUND(SQRT(AVG(score * score) - AVG(score) * AVG(score)), 2)
                    END          AS std_dev
        FROM v6_effective_ratings
        GROUP BY movie_id
      ) r ON r.movie_id = m.id
      LEFT JOIN (
        SELECT movie_id, SUM((11 - rank) / 10.0) AS boost
        FROM v6_effective_top3
        GROUP BY movie_id
      ) t ON t.movie_id = m.id;
    `);
  } else {
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
             THEN MIN(10.0, r.score_sum / ${GROUP_SIZE}.0 + COALESCE(t.boost, 0)) END AS boosted_score,
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
      data = require('./initial-letterboxd.json');
    } catch (_) {
      try {
        data = require('./data/initial-letterboxd.json');
      } catch (e) {
        console.warn('[db] Could not load initial-letterboxd.json:', e.message);
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

async function initMultiGroup() {
  try {
    const userCountRow = await get('SELECT COUNT(*) AS c FROM users');
    if (!userCountRow || Number(userCountRow.c) === 0) {
      console.log('[db] Initializing multi-group schema and migrating existing voters...');
      const defaultPass = process.env.MN_PASSWORD || 'changeme';
      const defaultHash = hashPassword(defaultPass);

      const initialUsers = [
        { username: 'Φώτης', displayName: 'Φώτης', isAdmin: 1 },
        { username: 'Μητσέας', displayName: 'Μητσέας', isAdmin: 0 },
        { username: 'Παντελής', displayName: 'Παντελής', isAdmin: 0 },
        { username: 'Στέλιας', displayName: 'Στέλιας', isAdmin: 0 },
        { username: 'Λεόντιος', displayName: 'Λεόντιος', isAdmin: 0 },
        { username: 'Κλαίρη', displayName: 'Κλαίρη', isAdmin: 0 },
        { username: 'mnAdmin', displayName: 'Admin', isAdmin: 1 },
      ];

      if (process.env.GUEST_PASSWORD) {
        initialUsers.push({
          username: 'Σάκιας',
          displayName: 'Σάκιας',
          isAdmin: 0,
          hash: hashPassword(process.env.GUEST_PASSWORD),
        });
      }

      for (const u of initialUsers) {
        const pHash = u.hash || defaultHash;
        await run(
          'INSERT OR IGNORE INTO users (username, display_name, password_hash, is_admin) VALUES (?, ?, ?, ?)',
          u.username, u.displayName, pHash, u.isAdmin
        );
      }

      // Ensure Group 1 ("The Originals") and Group 2 ("Movie Nights II") exist
      await run("INSERT OR IGNORE INTO groups (id, name, slug) VALUES (1, 'The Originals', 'the-originals')");
      await run("INSERT OR IGNORE INTO groups (id, name, slug) VALUES (2, 'Movie Nights II', 'group-2')");

      // Add Group 1 members
      const g1Voters = ['Φώτης', 'Μητσέας', 'Παντελής', 'Στέλιας', 'Λεόντιος', 'Κλαίρη'];
      for (const v of g1Voters) {
        const user = await get('SELECT id FROM users WHERE username = ?', v);
        if (user) {
          const role = (v === 'Φώτης') ? 'admin' : 'member';
          await run(
            'INSERT OR IGNORE INTO group_members (group_id, user_id, role) VALUES (1, ?, ?)',
            user.id, role
          );
        }
      }

      // Add Φώτης to Group 2 as initial admin
      const fotis = await get("SELECT id FROM users WHERE username = 'Φώτης'");
      if (fotis) {
        await run('INSERT OR IGNORE INTO group_members (group_id, user_id, role) VALUES (2, ?, ?)', fotis.id, 'admin');
      }

      // Backfill Group 1 movie status from movies.mn and movies.watchlist
      await run(`
        INSERT OR IGNORE INTO group_movie_status (group_id, movie_id, mn, watchlist)
        SELECT 1, id, mn, watchlist
        FROM movies
        WHERE mn = 1 OR watchlist = 1
      `);

      // Backfill Group 1 watchlist votes
      await run(`
        INSERT OR IGNORE INTO group_watchlist_votes (group_id, movie_id, user_id)
        SELECT 1, wv.movie_id, u.id
        FROM watchlist_votes wv
        JOIN users u ON (u.display_name = wv.voter OR u.username = wv.voter)
      `);

      // Backfill user_id on ratings and top3
      await run(`
        UPDATE ratings
        SET user_id = (
          SELECT u.id FROM users u
          WHERE u.display_name = ratings.voter OR u.username = ratings.voter
        )
        WHERE user_id IS NULL
      `);

      await run(`
        UPDATE top3
        SET user_id = (
          SELECT u.id FROM users u
          WHERE u.display_name = top3.voter OR u.username = top3.voter
        )
        WHERE user_id IS NULL
      `);

      await run('UPDATE lists SET group_id = 1 WHERE group_id IS NULL');
      console.log('[db] Multi-group migration completed successfully.');
    }
  } catch (err) {
    console.warn('[db] Multi-group migration warning:', err.message);
  }
}

module.exports = { client, get, all, run, transaction, init, rewriteSql };
