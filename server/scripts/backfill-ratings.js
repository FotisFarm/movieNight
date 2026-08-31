#!/usr/bin/env node
/*
 * Fills movies.imdb_rating for films that have an imdb_id but no rating.
 *
 * This is the tail left by resolve-missing-ids.js: it writes imdb_id and
 * poster_path from TMDB, but a rating has to come from OMDb, and OMDb's free
 * tier allows only 1,000 requests/day — so ratings are a deliberate second
 * pass rather than part of that run.
 *
 * TMDB's own vote_average is NOT a substitute: the UI badge says "IMDb" and
 * links to IMDb, so the number behind it has to be IMDb's.
 *
 * Quota-aware: OMDb reports an exhausted key as a normal HTTP 200 with
 * Response:"False", which is indistinguishable from "no such film" at a
 * glance. Several consecutive failures therefore abort the run rather than
 * burn the rest of the budget, and rows already written stay written, so a
 * re-run resumes where this one stopped.
 *
 *   node server/scripts/backfill-ratings.js --dry-run
 *   node server/scripts/backfill-ratings.js
 *
 * Flags:
 *   --dry-run   report what would change, write nothing
 *   --force     include films that already have a rating (refreshes stale ones)
 *   --limit=N   only process the first N candidates
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env'), quiet: true });
const db = require('../db');
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

// Deliberately gentle: OMDb is the rate-limited one of the two APIs.
const CONCURRENCY = 4;
const MAX_CONSECUTIVE_FAILURES = 6;

async function mapLimit(items, n, worker) {
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (cursor < items.length) await worker(items[cursor++]);
  }));
}

(async () => {
  if (!process.env.OMDB_API_KEY) throw new Error('OMDB_API_KEY is not set');
  await db.init();

  const where = FORCE
    ? "imdb_id IS NOT NULL AND imdb_id != ''"
    : "imdb_id IS NOT NULL AND imdb_id != '' AND imdb_rating IS NULL";
  let films = await db.all(`SELECT id, title, year, imdb_id FROM movies WHERE ${where} ORDER BY id`);
  if (LIMIT) films = films.slice(0, LIMIT);

  console.log(`${films.length} films need a rating${DRY_RUN ? '  (dry run)' : ''}`);
  console.log(`OMDb free tier is 1,000 requests/day — this run costs about ${films.length}.\n`);

  let updated = 0, noRating = 0, consecutiveFailures = 0, done = 0;
  let aborted = null;
  const unrated = [];

  await mapLimit(films, CONCURRENCY, async (film) => {
    if (aborted) return;
    let detail = null;
    try {
      detail = await getImdbById(film.imdb_id);
    } catch (err) {
      consecutiveFailures++;
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) aborted = err.message;
      return;
    }

    if (!detail) {
      // Either a dead id or a spent quota — can't tell them apart from here,
      // so a run of these is treated as the quota and stops the job.
      consecutiveFailures++;
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        aborted = 'repeated OMDb failures — most likely the daily quota is spent';
      }
      return;
    }
    consecutiveFailures = 0;

    done++;
    if (done % 25 === 0) process.stdout.write(`  ${done}/${films.length}\r`);

    if (detail.imdbRating == null) {
      // The film is on IMDb but genuinely carries no rating yet. There's no
      // column to record that, so it will be retried on the next run.
      noRating++;
      unrated.push(film);
      return;
    }

    if (!DRY_RUN) {
      await db.run('UPDATE movies SET imdb_rating = ? WHERE id = ?', detail.imdbRating, film.id);
    }
    updated++;
  });

  console.log(`\n${DRY_RUN ? 'would update' : 'updated'} : ${updated}`);
  console.log(`on IMDb but unrated : ${noRating}`);
  if (unrated.length) {
    for (const f of unrated) console.log(`    ${f.title} (${f.year || '?'})  ${f.imdb_id}`);
  }
  if (aborted) {
    console.log(`\n⚠ stopped early: ${aborted}`);
    console.log('  Rows already written are kept — re-run tomorrow to finish.');
  }

  const left = await db.get(
    "SELECT COUNT(*) AS n FROM movies WHERE imdb_id IS NOT NULL AND imdb_id != '' AND imdb_rating IS NULL"
  );
  const total = await db.get('SELECT COUNT(*) AS n FROM movies');
  console.log(`\n${total.n - left.n}/${total.n} films now have an IMDb rating.`);
  process.exit(0);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
