#!/usr/bin/env node
/*
 * Populates movies.runtime (in minutes) from TMDB (with OMDb fallback)
 * for all movies in the database.
 *
 * Usage:
 *   node server/scripts/backfill-runtimes.js --dry-run
 *   node server/scripts/backfill-runtimes.js
 *   node server/scripts/backfill-runtimes.js --force     # re-check films even if runtime is already set
 *   node server/scripts/backfill-runtimes.js --limit=50  # test with first 50
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env'), quiet: true });
const db = require('../db');
const { findByImdbId, getMovieDetails, searchMovie } = require('../tmdb');
const { getImdbById } = require('../omdb');

const args = Object.fromEntries(
  process.argv.slice(2)
    .map(a => a.match(/^--([^=]+)(?:=(.*))?$/))
    .filter(Boolean)
    .map(m => [m[1], m[2] === undefined ? true : m[2]])
);

const DRY_RUN = Boolean(args['dry-run']);
const FORCE = Boolean(args.force);
const LIMIT = args.limit ? parseInt(args.limit, 10) : null;
const CONCURRENCY = 15;

async function mapLimit(items, n, worker) {
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (cursor < items.length) await worker(items[cursor++]);
  }));
}

(async () => {
  await db.init();

  const where = FORCE ? '1=1' : 'runtime IS NULL OR runtime = 0';
  let films = await db.all(`SELECT id, title, year, imdb_id, runtime FROM movies WHERE ${where} ORDER BY id`);
  if (LIMIT) films = films.slice(0, LIMIT);

  const total = await db.get('SELECT COUNT(*) AS n FROM movies');
  console.log(`🎬 ${total.n} films total | ${films.length} to resolve runtimes${DRY_RUN ? ' (dry run)' : ''}\n`);

  let updated = 0, unchanged = 0, notFound = 0, done = 0;

  await mapLimit(films, CONCURRENCY, async (film) => {
    let runtime = null;

    // 1. Try TMDB by IMDb ID
    if (film.imdb_id) {
      try {
        const tmdbMovie = await findByImdbId(film.imdb_id);
        if (tmdbMovie?.tmdbId) {
          const details = await getMovieDetails(tmdbMovie.tmdbId);
          if (details?.runtime) runtime = details.runtime;
        }
      } catch (_) {}
    }

    // 2. Try TMDB by title/year search if missing
    if (!runtime && film.title) {
      try {
        const [tmdbMatch] = await searchMovie(film.title, film.year);
        if (tmdbMatch?.tmdbId) {
          const details = await getMovieDetails(tmdbMatch.tmdbId);
          if (details?.runtime) runtime = details.runtime;
        }
      } catch (_) {}
    }

    // 3. Fallback to OMDb if still missing
    if (!runtime && film.imdb_id && process.env.OMDB_API_KEY) {
      try {
        const omdbDetail = await getImdbById(film.imdb_id);
        if (omdbDetail?.runtime) runtime = omdbDetail.runtime;
      } catch (_) {}
    }

    done++;
    if (runtime) {
      if (film.runtime === runtime) {
        unchanged++;
      } else {
        updated++;
        if (!DRY_RUN) {
          await db.run('UPDATE movies SET runtime = ? WHERE id = ?', runtime, film.id);
        }
        if (updated <= 10 || updated % 50 === 0) {
          console.log(`  [${done}/${films.length}] ✓ ${film.title} (${film.year}) -> ${runtime}m`);
        }
      }
    } else {
      notFound++;
    }
  });

  console.log(`\n🎉 Done: ${updated} updated, ${unchanged} unchanged, ${notFound} not found (${done} processed).`);
  process.exit(0);
})().catch(err => {
  console.error('❌ Error during backfill:', err);
  process.exit(1);
});
