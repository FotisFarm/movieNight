#!/usr/bin/env node
/*
 * One-time (and re-runnable) poster backfill: fills movies.poster_path from
 * TMDB for every film that has an imdb_id but no poster yet.
 *
 * TMDB has no daily request cap, so this is cheap to run and safe to re-run —
 * unlike OMDb, whose 1,000/day would be spent by a single pass.
 *
 * Talks to whatever database server/db.js is pointed at, so it follows the
 * usual env: TURSO_DATABASE_URL/TURSO_AUTH_TOKEN in production, otherwise the
 * local file at DATA_DIR/movies.db.
 *
 *   node server/scripts/backfill-posters.js --dry-run
 *   node server/scripts/backfill-posters.js
 *   node server/scripts/backfill-posters.js --force     # re-resolve every film
 *
 * Flags:
 *   --dry-run   report what would change, write nothing
 *   --force     include films that already have a poster_path
 *   --limit=N   only process the first N candidates
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env'), quiet: true });
const db = require('../db');
const { findByImdbId } = require('../tmdb');

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

// Runs `worker` over `items` with at most `n` in flight.
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
    : "imdb_id IS NOT NULL AND imdb_id != '' AND poster_path IS NULL";
  let films = await db.all(`SELECT id, title, year, imdb_id, poster_path FROM movies WHERE ${where} ORDER BY id`);
  if (LIMIT) films = films.slice(0, LIMIT);

  const total = await db.get('SELECT COUNT(*) AS n FROM movies');
  console.log(`${total.n} films total | ${films.length} to resolve${DRY_RUN ? '  (dry run)' : ''}\n`);

  let updated = 0, unchanged = 0, noPoster = 0, notFound = 0, done = 0;
  const problems = [];

  await mapLimit(films, CONCURRENCY, async (film) => {
    const hit = await findByImdbId(film.imdb_id);
    done++;
    if (done % 50 === 0) process.stdout.write(`  ${done}/${films.length}\r`);

    if (!hit) {
      notFound++;
      problems.push({ film, why: 'no TMDB record for this imdb_id' });
      return;
    }
    if (!hit.posterPath) {
      noPoster++;
      problems.push({ film, why: `TMDB has "${hit.title}" but no poster image` });
      return;
    }
    if (hit.posterPath === film.poster_path) { unchanged++; return; }

    if (!DRY_RUN) {
      await db.run('UPDATE movies SET poster_path = ? WHERE id = ?', hit.posterPath, film.id);
    }
    updated++;
  });

  console.log(`\n${DRY_RUN ? 'would update' : 'updated'} : ${updated}`);
  if (unchanged) console.log(`already correct: ${unchanged}`);
  console.log(`no poster on TMDB: ${noPoster}`);
  console.log(`imdb_id not on TMDB: ${notFound}`);

  if (problems.length) {
    console.log('\nFilms left without a poster (usually a wrong imdb_id — see fix-imdb-ids.js):');
    for (const p of problems) {
      console.log(`  ${p.film.title} (${p.film.year || '?'})  ${p.film.imdb_id}  — ${p.why}`);
    }
  }

  const remaining = await db.get(
    "SELECT COUNT(*) AS n FROM movies WHERE poster_path IS NULL"
  );
  console.log(`\n${total.n - remaining.n}/${total.n} films now have a poster.`);
  process.exit(0);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
