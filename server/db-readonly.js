// Read-only SQLite connection for the chatbot's text-to-SQL tool.
// Opened with { readonly: true } so SQLite itself rejects every write at the
// engine level — the read-only guarantee does not depend on prompt discipline.
const Database = require('better-sqlite3');
const path = require('path');
const { rankBonus } = require('./scoring');
const { GROUP_SIZE } = require('./config');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'movies.db');

// WAL mode (set by the main writable connection) lets a second read-only
// connection read concurrently and safely.
const roDb = new Database(DB_PATH, { readonly: true });

// Reuse the canonical boost formula instead of re-deriving it in SQL.
roDb.function('rank_bonus', rankBonus);

// A view that exposes the derived scores which normally live only in JS
// (enrichMovie in routes/movies.js). The chatbot queries these columns so its
// numbers always match the rest of the app.
//   fair_score    = mean of actual voters' scores
//   boost         = Σ rank_bonus(rank) over that film's Top-10 placements
//   fair_boosted  = min(10, fair_score + boost)   ("Fair score" in the UI)
//   boosted_score = min(10, sum/GROUP_SIZE + boost) ("Group score" in the UI)
//   std_dev       = population stddev of scores (NULL when < 2 voters)
roDb.exec(`
  CREATE TEMP VIEW IF NOT EXISTS movie_scores AS
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
    SELECT movie_id, SUM(rank_bonus(rank)) AS boost
    FROM top3
    GROUP BY movie_id
  ) t ON t.movie_id = m.id;
`);

const MAX_ROWS = 200;

// Runs a single read-only SELECT/WITH query and returns { rows } or { error }.
// Never throws — the LLM tool loop surfaces the error string and can retry.
function runReadOnlySql(rawSql) {
  const sql = String(rawSql || '').trim().replace(/;+\s*$/, '');
  if (!/^(select|with)\b/i.test(sql)) {
    return { error: 'Only single read-only SELECT/WITH queries are allowed.' };
  }
  try {
    // better-sqlite3 .prepare() rejects multi-statement strings, and the
    // read-only connection rejects any write — both enforced below the guard.
    const rows = roDb.prepare(sql).all();
    const truncated = rows.length > MAX_ROWS;
    return {
      rows: truncated ? rows.slice(0, MAX_ROWS) : rows,
      rowCount: rows.length,
      truncated,
    };
  } catch (err) {
    return { error: err.message };
  }
}

module.exports = { runReadOnlySql };
