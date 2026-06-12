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
    rank     INTEGER NOT NULL CHECK(rank IN (1,2,3)),
    UNIQUE(movie_id, voter)
  );
`);

// Migrations
try { db.exec("ALTER TABLE ratings ADD COLUMN comment TEXT NOT NULL DEFAULT ''"); } catch (_) {}

module.exports = db;
