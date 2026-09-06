// Daily production snapshot, run by .github/workflows/db-backup.yml.
//
// Produces two artifacts from the live Turso database:
//   1. a restorable SQL dump (schema + data)  -> committed to the `backups` branch
//   2. a regenerated server/data/seed.json    -> committed to `main`, so a fresh
//      clone seeds a local DB with current data instead of the original 834 films
//
// Read-only: it never writes to the database. Point TURSO_AUTH_TOKEN at a
// read-only token so that's enforced by the engine, not just by convention.
//
// Comments are deliberately excluded from seed.json — the repo is public and
// they're personal notes. The SQL dump (private-ish, same repo but not the
// thing people clone-and-run) omits them too, for the same reason.
const { createClient } = require('@libsql/client');
const fs = require('fs');
const path = require('path');
const { VOTERS } = require('../config');

// rating_history goes into the .sql snapshot (it's the only restorable record
// of it) but deliberately NOT into seed.json: that file is committed daily and
// engineered to produce no diff on an unchanged day, which an append-only table
// would break permanently. buildSeed() below queries its own tables, so adding
// it here affects the snapshot only.
const TABLES = ['movies', 'ratings', 'top3', 'watchlist_votes', 'lists', 'list_items', 'list_slug_aliases', 'rating_history'];
const OUT_SQL = process.env.OUT_SQL || path.join(__dirname, '..', '..', 'movies_dump.sql');
const SEED_PATH = path.join(__dirname, '..', 'data', 'seed.json');

const url = process.env.TURSO_DATABASE_URL;
if (!url) {
  console.error('TURSO_DATABASE_URL is required.');
  process.exit(1);
}
const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });

// SQLite literal: NULL, bare number, or single-quote-escaped string.
function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  return `'${String(value).replace(/'/g, "''")}'`;
}

// Schema + INSERTs for every table, ordered by id so the file is byte-stable
// between runs when nothing changed.
async function writeSqlDump() {
  const lines = [
    '-- Movie Nights production snapshot',
    `-- generated ${new Date().toISOString()}`,
    '--',
    '-- Restore into a local SQLite file with:  sqlite3 movies.db < this-file.sql',
    'PRAGMA foreign_keys=OFF;',
    'BEGIN TRANSACTION;',
  ];

  for (const table of TABLES) {
    const schema = await client.execute({
      sql: "SELECT sql FROM sqlite_master WHERE type='table' AND name = ?",
      args: [table],
    });
    if (!schema.rows.length || !schema.rows[0].sql) continue;

    lines.push('', `DROP TABLE IF EXISTS ${table};`, `${schema.rows[0].sql};`);

    const orderCol = table === 'list_slug_aliases' ? 'slug' : 'id';
    const rs = await client.execute(`SELECT * FROM ${table} ORDER BY ${orderCol}`);
    const cols = rs.columns.filter(c => c !== 'comment');
    for (const row of rs.rows) {
      const values = cols.map(c => sqlLiteral(row[c])).join(', ');
      lines.push(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${values});`);
    }
    console.log(`  ${table}: ${rs.rows.length} rows`);
  }

  lines.push('', 'COMMIT;', 'PRAGMA foreign_keys=ON;', '');
  fs.writeFileSync(OUT_SQL, lines.join('\n'), 'utf8');
  console.log(`Wrote SQL dump -> ${OUT_SQL}`);
}

// Rebuilds seed.json in the shape seed.js expects. Scores are emitted as
// strings because seed.js's parseRating() rejects non-strings outright.
async function writeSeedJson() {
  const movies = (await client.execute('SELECT * FROM movies ORDER BY id')).rows;
  const ratings = (await client.execute('SELECT movie_id, voter, score FROM ratings')).rows;
  const top3 = (await client.execute('SELECT movie_id, voter, rank FROM top3')).rows;
  const wlVotes = (await client.execute('SELECT movie_id, voter FROM watchlist_votes')).rows;

  const withRuntime = movies.filter(m => m.runtime != null && m.runtime > 0).length;
  console.log(`Films with runtime in database: ${withRuntime} / ${movies.length}`);

  const perMovie = new Map();
  for (const m of movies) perMovie.set(m.id, { ratings: {}, top3: {}, watchlistVotes: [] });

  for (const r of ratings) {
    const entry = perMovie.get(r.movie_id);
    if (entry) entry.ratings[r.voter] = String(r.score);
  }
  for (const t of top3) {
    const entry = perMovie.get(t.movie_id);
    if (entry) entry.top3[t.voter] = t.rank;
  }
  for (const w of wlVotes) {
    const entry = perMovie.get(w.movie_id);
    if (entry) entry.watchlistVotes.push(w.voter);
  }

  // Stable key order everywhere, so a day with no changes produces no diff.
  const orderedByVoter = (map) => {
    const out = {};
    for (const voter of VOTERS) if (voter in map) out[voter] = map[voter];
    return out;
  };

  const rows = movies.map((m) => {
    const extra = perMovie.get(m.id);
    return {
      director: m.director || '',
      movie: m.title || '',
      year: m.year || '',
      rank: m.rank_global ?? null,
      mn: m.mn === 1 ? 'Y' : '',
      watchlist: m.watchlist === 1 ? 'Y' : '',
      tokens: m.tokens || '',
      tokenPts: m.token_pts || 0,
      imdb_id: m.imdb_id ?? null,
      imdb_rating: m.imdb_rating ?? null,
      poster_path: m.poster_path ?? null,
      runtime: m.runtime ?? null,
      ratings: orderedByVoter(extra.ratings),
      top3: orderedByVoter(extra.top3),
      watchlistVotes: extra.watchlistVotes.slice().sort(),
    };
  });

  // Pretty-printed (not minified) so daily commits produce small, readable
  // line diffs instead of rewriting one enormous line.
  fs.writeFileSync(SEED_PATH, `${JSON.stringify(rows, null, 2)}\n`, 'utf8');
  console.log(`Wrote seed.json -> ${SEED_PATH} (${rows.length} films)`);
}

(async () => {
  await writeSqlDump();
  await writeSeedJson();
})().catch((err) => {
  console.error('Backup failed:', err);
  process.exit(1);
});
