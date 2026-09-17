#!/usr/bin/env node
/*
 * One-time (and re-runnable) backdrop backfill: fills movies.backdrop_path
 * from TMDB for every film that has an imdb_id but no backdrop yet.
 *
 *   node server/scripts/backfill-backdrops.js --dry-run
 *   node server/scripts/backfill-backdrops.js
 *   node server/scripts/backfill-backdrops.js --force
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env'), quiet: true });
const db = require('../db');
const { findByImdbId, searchMovie } = require('../tmdb');

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
  if (!process.env.TMDB_API_KEY) throw new Error('TMDB_API_KEY is not set');
  await db.init();

  const where = FORCE
    ? "imdb_id IS NOT NULL AND imdb_id != ''"
    : "imdb_id IS NOT NULL AND imdb_id != '' AND (backdrop_path IS NULL OR backdrop_path = '')";
  let films = await db.all(`SELECT id, title, year, imdb_id, backdrop_path FROM movies WHERE ${where} ORDER BY id`);
  if (LIMIT) films = films.slice(0, LIMIT);

  const total = await db.get('SELECT COUNT(*) AS n FROM movies');
  console.log(`${total.n} films total | ${films.length} to resolve backdrops${DRY_RUN ? ' (dry run)' : ''}\n`);

  let updated = 0, notFound = 0, noBackdrop = 0, done = 0;

  await mapLimit(films, CONCURRENCY, async (film) => {
    let hit = await findByImdbId(film.imdb_id);
    if (!hit && film.title) {
      const [first] = await searchMovie(film.title, film.year);
      hit = first;
    }
    done++;
    if (done % 50 === 0 || done === films.length) {
      process.stdout.write(`  ${done}/${films.length}\r`);
    }

    if (!hit) {
      notFound++;
      return;
    }
    if (!hit.backdropPath) {
      noBackdrop++;
      return;
    }

    if (!DRY_RUN) {
      await db.run('UPDATE movies SET backdrop_path = ? WHERE id = ?', hit.backdropPath, film.id);
    }
    updated++;
  });

  console.log(`\nDone. Updated: ${updated} | No backdrop: ${noBackdrop} | Not found: ${notFound}`);
  process.exit(0);
})();
