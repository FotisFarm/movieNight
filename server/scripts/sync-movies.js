/** Sync main DB → sakias DB. Runs inside the sakias container every 30 min.
 *  Copies movies, ratings, top3, and watchlist_votes from the main DB.
 *  Σάκιας's own rows are never overwritten (WHERE voter != 'Σάκιας').
 */
const Database = require('better-sqlite3');

const GHOST = 'Σάκιας';

const mainDb   = new Database('/app/main-data/movies.db', { readonly: true });
const sakiasDb = new Database('/app/data/movies.db');

// ── Movies ────────────────────────────────────────────────────────────────────
const mainMovies = mainDb.prepare('SELECT * FROM movies').all();
const upsertMovie = sakiasDb.prepare(`
  INSERT INTO movies (id, director, title, year, rank_global, mn, watchlist, cinobo, tokens, token_pts, imdb_id, imdb_rating)
  VALUES (@id, @director, @title, @year, @rank_global, @mn, @watchlist, @cinobo, @tokens, @token_pts, @imdb_id, @imdb_rating)
  ON CONFLICT(id) DO UPDATE SET
    director    = excluded.director,
    title       = excluded.title,
    year        = excluded.year,
    rank_global = excluded.rank_global,
    mn          = excluded.mn,
    imdb_id     = excluded.imdb_id,
    imdb_rating = excluded.imdb_rating
`);

// ── Ratings ───────────────────────────────────────────────────────────────────
const mainRatings = mainDb.prepare(`SELECT * FROM ratings WHERE voter != ?`).all(GHOST);
const upsertRating = sakiasDb.prepare(`
  INSERT INTO ratings (movie_id, voter, score, comment)
  VALUES (@movie_id, @voter, @score, @comment)
  ON CONFLICT(movie_id, voter) DO UPDATE SET
    score   = excluded.score,
    comment = excluded.comment
`);

// ── Top 10 picks ──────────────────────────────────────────────────────────────
const mainTop3 = mainDb.prepare(`SELECT * FROM top3 WHERE voter != ?`).all(GHOST);
const upsertTop3 = sakiasDb.prepare(`
  INSERT INTO top3 (movie_id, voter, rank)
  VALUES (@movie_id, @voter, @rank)
  ON CONFLICT(movie_id, voter) DO UPDATE SET rank = excluded.rank
`);

// ── Watchlist votes ───────────────────────────────────────────────────────────
const mainWl = mainDb.prepare(`SELECT * FROM watchlist_votes WHERE voter != ?`).all(GHOST);
const upsertWl = sakiasDb.prepare(`
  INSERT OR IGNORE INTO watchlist_votes (movie_id, voter)
  VALUES (@movie_id, @voter)
`);

// ── Run everything in one transaction ────────────────────────────────────────
const sync = sakiasDb.transaction(() => {
  for (const m of mainMovies)  upsertMovie.run(m);
  for (const r of mainRatings) upsertRating.run(r);
  for (const t of mainTop3)    upsertTop3.run(t);
  for (const w of mainWl)      upsertWl.run(w);
});

sync();

console.log(`[sync] movies=${mainMovies.length} ratings=${mainRatings.length} top3=${mainTop3.length} watchlist=${mainWl.length}`);

mainDb.close();
sakiasDb.close();
