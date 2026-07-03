/** Sync movies table from main DB into sakias DB. Run inside the sakias container. */
const Database = require('better-sqlite3');

const mainDb = new Database('/app/main-data/movies.db', { readonly: true });
const sakiasDb = new Database('/app/data/movies.db');

const mainMovies = mainDb.prepare('SELECT * FROM movies').all();

const upsert = sakiasDb.prepare(`
  INSERT INTO movies (id, director, title, year, rank_global, mn, watchlist, cinobo, tokens, token_pts, imdb_id, imdb_rating)
  VALUES (@id, @director, @title, @year, @rank_global, @mn, @watchlist, @cinobo, @tokens, @token_pts, @imdb_id, @imdb_rating)
  ON CONFLICT(id) DO UPDATE SET
    director  = excluded.director,
    title     = excluded.title,
    year      = excluded.year,
    rank_global = excluded.rank_global,
    mn        = excluded.mn,
    imdb_id   = excluded.imdb_id,
    imdb_rating = excluded.imdb_rating
`);

const sync = sakiasDb.transaction(() => {
  for (const m of mainMovies) upsert.run(m);
});

sync();
console.log(`[sync] ${mainMovies.length} movies synced from main to sakias`);

mainDb.close();
sakiasDb.close();
