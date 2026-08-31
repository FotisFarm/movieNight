#!/usr/bin/env node
/*
 * Applies a hand-reviewed list of IMDb ids from reviewed-ids.json.
 *
 * resolve-missing-ids.js and fix-imdb-ids.js deliberately refuse to guess on
 * the hard cases. This is where those decisions live once a human has made
 * them — as data, not as a one-off command, so the exact same reviewed set can
 * be replayed against dev and then prod and the reasoning stays readable.
 *
 * Each entry writes imdb_id, imdb_rating (OMDb) and poster_path (TMDB).
 * `newTitle` is optional: null means the stored title is deliberately kept —
 * several are, either because ours is already correct or because ours is the
 * one we want (the Greek title of a Greek film, "A Fistful of Dynamite" over
 * TMDB's "Duck, You Sucker").
 *
 * Year and director are never touched. TMDB's year is often a later release
 * date rather than the production year, and its director strings would split
 * our grouping — "Joel Coen, Ethan Coen" is a different Rankings bucket from
 * the "Coen Brothers" the rest of the collection uses.
 *
 *   node server/scripts/apply-reviewed-ids.js            # dry run
 *   node server/scripts/apply-reviewed-ids.js --apply
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env'), quiet: true });
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { findByImdbId } = require('../tmdb');
const { getImdbById } = require('../omdb');

const args = Object.fromEntries(
  process.argv.slice(2)
    .map(a => a.match(/^--([^=]+)(?:=(.*))?$/))
    .filter(Boolean)
    .map(m => [m[1], m[2] === undefined ? true : m[2]])
);
const APPLY = Boolean(args.apply);
const LIST_PATH = args.list || path.join(__dirname, 'reviewed-ids.json');

(async () => {
  await db.init();
  const entries = JSON.parse(fs.readFileSync(LIST_PATH, 'utf8'));
  console.log(`${entries.length} reviewed entries${APPLY ? '' : '  (dry run)'}\n`);

  let written = 0;
  const missing = [];

  for (const entry of entries) {
    const film = await db.get(
      'SELECT id, title, year, imdb_id FROM movies WHERE title = ? AND year = ?',
      entry.match.title, entry.match.year
    );
    if (!film) {
      missing.push(entry);
      console.log(`  MISS  "${entry.match.title}" (${entry.match.year}) — no such film here`);
      continue;
    }

    const tmdbHit = await findByImdbId(entry.imdb_id);
    let rating = null;
    try { rating = (await getImdbById(entry.imdb_id))?.imdbRating ?? null; } catch (_) {}

    const finalTitle = entry.newTitle || film.title;
    console.log(
      `  ${APPLY ? 'WRITE' : 'would'}  "${film.title}" (${film.year})` +
      `${entry.newTitle ? ` -> "${entry.newTitle}"` : '  [title kept]'}` +
      `  ${entry.imdb_id}${rating != null ? ` rating ${rating}` : ' (no rating)'}` +
      `${tmdbHit?.posterPath ? ' +poster' : ' (NO POSTER)'}`
    );

    if (APPLY) {
      await db.run(
        'UPDATE movies SET imdb_id = ?, imdb_rating = ?, poster_path = ?, title = ? WHERE id = ?',
        entry.imdb_id, rating, tmdbHit?.posterPath ?? null, finalTitle, film.id
      );
      written++;
    }
  }

  console.log(`\n${APPLY ? `Updated ${written}` : `Would update ${entries.length - missing.length}`} films.`);
  if (missing.length) console.log(`${missing.length} entries matched no film in this database.`);
  if (!APPLY) console.log('\nNothing written. Re-run with --apply.');
  process.exit(0);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
