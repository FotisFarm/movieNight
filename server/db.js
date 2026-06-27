const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'movies.db');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
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
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS watchlist_votes (
    id       INTEGER PRIMARY KEY,
    movie_id INTEGER NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
    voter    TEXT    NOT NULL,
    UNIQUE(movie_id, voter)
  )
`);

// Migrations
try { db.exec("ALTER TABLE ratings ADD COLUMN comment TEXT NOT NULL DEFAULT ''"); } catch (_) {}
try { db.exec("ALTER TABLE movies ADD COLUMN imdb_id TEXT DEFAULT NULL"); } catch (_) {}
try { db.exec("ALTER TABLE movies ADD COLUMN imdb_rating REAL DEFAULT NULL"); } catch (_) {}

// Widen top3 rank constraint 1–3 → 1–10 (SQLite can't ALTER a CHECK, so rebuild). Idempotent.
try {
  const t = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='top3'").get();
  if (t && t.sql.includes('1,2,3')) {
    db.exec(`
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

module.exports = db;
