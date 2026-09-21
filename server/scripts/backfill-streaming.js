#!/usr/bin/env node
/*
 * One-time (and re-runnable) Greek streaming backfill:
 * Queries TMDB (JustWatch) for streaming providers in Greece ('GR') for every film.
 * Updates movies.stream_gr and generates server/initial-streaming.json.
 *
 * Usage:
 *   node server/scripts/backfill-streaming.js
 *   node server/scripts/backfill-streaming.js --limit=50
 *   node server/scripts/backfill-streaming.js --dry-run
 *   node server/scripts/backfill-streaming.js --force
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env'), quiet: true });
const db = require('../db');
const { getMovieWatchProviders } = require('../tmdb');

const args = Object.fromEntries(
  process.argv.slice(2)
    .map(a => a.match(/^--([^=]+)(?:=(.*))?$/))
    .filter(Boolean)
    .map(m => [m[1], m[2] === undefined ? true : m[2]])
);

const DRY_RUN = Boolean(args['dry-run']);
const FORCE = Boolean(args.force);
const LIMIT = args.limit ? parseInt(args.limit, 10) : null;
const CONCURRENCY = 12;

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
    ? '1=1'
    : "(stream_gr IS NULL OR stream_gr = '')";
  let films = await db.all(`SELECT id, title, year, imdb_id, stream_gr FROM movies WHERE ${where} ORDER BY id`);
  if (LIMIT) films = films.slice(0, LIMIT);

  const total = await db.get('SELECT COUNT(*) AS n FROM movies');
  console.log(`${total.n} films total | ${films.length} to query for Greek streaming${DRY_RUN ? ' (dry run)' : ''}\n`);

  let updated = 0, withStream = 0, cinoboCount = 0, netflixCount = 0, done = 0;
  const resultMap = {};

  // If initial-streaming.json already exists, seed our resultMap so we accumulate full coverage
  const jsonPath = path.join(__dirname, '..', 'initial-streaming.json');
  if (fs.existsSync(jsonPath)) {
    try {
      const existingJson = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      Object.assign(resultMap, existingJson);
    } catch (_) {}
  }

  await mapLimit(films, CONCURRENCY, async (film) => {
    try {
      const res = await getMovieWatchProviders(film.imdb_id, film.title, film.year, 'GR');
      const flatrate = res?.flatrate || [];
      const streamNames = flatrate.map(p => p.name).join('|');

      done++;
      if (done % 50 === 0 || done === films.length) {
        process.stdout.write(`  ${done}/${films.length} (streaming: ${withStream}, cinobo: ${cinoboCount})\r`);
      }

      if (streamNames) {
        withStream++;
        resultMap[film.id] = streamNames;
        const lower = streamNames.toLowerCase();
        if (lower.includes('cinobo')) cinoboCount++;
        if (lower.includes('netflix')) netflixCount++;

        if (!DRY_RUN) {
          await db.run('UPDATE movies SET stream_gr = ? WHERE id = ?', streamNames, film.id);
        }
        updated++;
      } else {
        // Mark as empty in DB if forced so it's not NULL if that's desired, or leave as ''
        if (!DRY_RUN && FORCE) {
          await db.run("UPDATE movies SET stream_gr = '' WHERE id = ?", film.id);
        }
      }
    } catch (err) {
      done++;
    }
  });

  // Write snapshot JSON files
  if (!DRY_RUN) {
    const dataJsonPath = path.join(__dirname, '..', 'data', 'initial-streaming.json');
    const jsonStr = JSON.stringify(resultMap);
    fs.writeFileSync(jsonPath, jsonStr, 'utf8');
    try {
      const dataDir = path.join(__dirname, '..', 'data');
      if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(dataJsonPath, jsonStr, 'utf8');
    } catch (_) {}
    console.log(`\nSaved streaming map (${Object.keys(resultMap).length} films) to ${jsonPath}`);
  }

  console.log(`\nDone. Checked: ${done} | Streaming in GR: ${withStream} | Cinobo: ${cinoboCount} | Netflix: ${netflixCount}`);
  process.exit(0);
})();
