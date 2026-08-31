#!/usr/bin/env node
/*
 * Repairs stored imdb_ids that point at the wrong IMDb entry.
 *
 * Why this exists: omdb.js's title search matches whole words only and happily
 * returns a making-of, a trailer or a podcast episode for the real film — so a
 * handful of films ended up with ids like tt2709758 ("The Making of
 * 'Schindler's List'") instead of tt0108052. Those films show the *wrong* IMDb
 * rating today, and can't resolve a poster.
 *
 * Detection uses TMDB, which indexes by imdb_id: if a stored id resolves to a
 * film whose title and year don't match ours — or resolves to nothing at all —
 * it's suspect. The replacement is then found by searching TMDB for our own
 * title + year and reading back that film's IMDb id.
 *
 * Nothing is written without --apply, and even then only for proposals
 * confident enough to be automatic (title matches, year within one).
 * Everything else is printed for a human to settle in the MovieModal IMDb
 * editor.
 *
 *   node server/scripts/fix-imdb-ids.js              # report only
 *   node server/scripts/fix-imdb-ids.js --apply      # write the confident ones
 *
 * Flags:
 *   --apply     write imdb_id, imdb_rating and poster_path for confident matches
 *   --limit=N   only examine the first N films
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env'), quiet: true });
const db = require('../db');
const { findByImdbId, searchMovie, getExternalIds } = require('../tmdb');
const { getImdbById } = require('../omdb');

const args = Object.fromEntries(
  process.argv.slice(2)
    .map(a => a.match(/^--([^=]+)(?:=(.*))?$/))
    .filter(Boolean)
    .map(m => [m[1], m[2] === undefined ? true : m[2]])
);

const APPLY = Boolean(args.apply);
const LIMIT = args.limit ? parseInt(args.limit, 10) : null;
const CONCURRENCY = 10;

// Strips accents, punctuation and case so "Zazie dans le Métro" and
// "Zazie in the Metro" at least compare on equal footing.
const norm = s => (s || '').toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]/gu, '');

// Alternate/translated titles are legitimate (the collection is full of them),
// so containment counts as a match — but only when the shorter title is most
// of the longer one. Bare containment matched "Seven" inside "Seven Sundays"
// and nearly overwrote Se7en's perfectly good id with a different film.
const CONTAINMENT_RATIO = 0.6;

function titlesMatch(ours, candidate) {
  const a = norm(ours);
  const b = norm(candidate);
  if (!a || !b) return false;
  if (a === b) return true;
  if (!(a.includes(b) || b.includes(a))) return false;
  return Math.min(a.length, b.length) / Math.max(a.length, b.length) >= CONTAINMENT_RATIO;
}

function yearGap(ours, theirs) {
  const a = parseInt(String(ours || '').slice(0, 4));
  const b = parseInt(String(theirs || '').slice(0, 4));
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.abs(a - b);
}

async function mapLimit(items, n, worker) {
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (cursor < items.length) await worker(items[cursor++]);
  }));
}

(async () => {
  if (!process.env.TMDB_API_KEY) throw new Error('TMDB_API_KEY is not set');
  await db.init();

  let films = await db.all(
    "SELECT id, title, year, imdb_id, imdb_rating FROM movies WHERE imdb_id IS NOT NULL AND imdb_id != '' ORDER BY id"
  );
  if (LIMIT) films = films.slice(0, LIMIT);
  console.log(`Checking ${films.length} films with a stored imdb_id…\n`);

  // ── pass 1: which stored ids look wrong? ──
  const suspects = [];
  let done = 0;
  await mapLimit(films, CONCURRENCY, async (film) => {
    const hit = await findByImdbId(film.imdb_id);
    done++;
    if (done % 100 === 0) process.stdout.write(`  ${done}/${films.length}\r`);
    if (!hit) { suspects.push({ film, found: null }); return; }
    if (!titlesMatch(film.title, hit.title) && !titlesMatch(film.title, hit.originalTitle)) {
      suspects.push({ film, found: hit });
      return;
    }
    if (yearGap(film.year, hit.year) > 1) suspects.push({ film, found: hit });
  });

  console.log(`\n${suspects.length} suspect ids.\n`);
  if (!suspects.length) process.exit(0);

  // ── pass 2: propose a replacement by searching TMDB for our own title ──
  const proposals = [];
  for (const s of suspects) {
    const results = await searchMovie(s.film.title, s.film.year);
    // Prefer a candidate that matches on both title and year.
    const best = results.find(r => titlesMatch(s.film.title, r.title) && yearGap(s.film.year, r.year) <= 1)
      || results.find(r => titlesMatch(s.film.title, r.title))
      || results[0]
      || null;
    const external = best ? await getExternalIds(best.tmdbId) : null;
    // Only ever auto-replace an id that resolves to *nothing* on TMDB — those
    // are the unambiguously broken ones (making-ofs, trailers, podcast
    // episodes, which TMDB doesn't index as films). If the stored id does
    // resolve to a real film, a title that looks wrong may simply be an
    // alternate one (Se7en, Nouvelle Vague, Warriors of the Wind), so that
    // case is always left for a human even when a tempting match exists.
    const confident = Boolean(
      s.found === null
      && best && external?.imdbId
      && (titlesMatch(s.film.title, best.title) || titlesMatch(s.film.title, best.originalTitle))
      && yearGap(s.film.year, best.year) <= 1
      && external.imdbId !== s.film.imdb_id
    );
    proposals.push({ ...s, best, newImdbId: external?.imdbId || null, confident });
  }

  const confident = proposals.filter(p => p.confident);
  const manual = proposals.filter(p => !p.confident);

  console.log('── Confident replacements ──');
  for (const p of confident) {
    console.log(
      `  ${p.film.title} (${p.film.year || '?'})\n` +
      `      was ${p.film.imdb_id} -> ${p.found ? `"${p.found.title}" (${p.found.year})` : 'nothing on TMDB'}\n` +
      `      now ${p.newImdbId} -> "${p.best.title}" (${p.best.year})${p.best.posterPath ? ' + poster' : ' (no poster)'}`
    );
  }

  if (manual.length) {
    console.log('\n── Needs a human (not applied) ──');
    for (const p of manual) {
      const why = !p.best ? 'no TMDB search result'
        : !p.newImdbId ? 'TMDB has no imdb_id for the match'
        : p.newImdbId === p.film.imdb_id ? 'search agrees with the stored id — probably fine'
        : p.found ? 'stored id resolves to a real film — could be an alternate title, decide by hand'
        : 'title/year too different to be sure';
      console.log(
        `  ${p.film.title} (${p.film.year || '?'})  ${p.film.imdb_id}` +
        `${p.best ? `  best guess: "${p.best.title}" (${p.best.year}) ${p.newImdbId || ''}` : ''}  — ${why}`
      );
    }
  }

  console.log(`\n${confident.length} confident, ${manual.length} need review.`);

  if (!APPLY) {
    console.log('\nNothing written. Re-run with --apply to write the confident ones.');
    process.exit(0);
  }

  // ── pass 3: write ──
  let written = 0;
  for (const p of confident) {
    // Refresh the IMDb rating too: it currently belongs to the wrong film.
    let rating = null;
    try { rating = (await getImdbById(p.newImdbId))?.imdbRating ?? null; } catch (_) {}
    await db.run(
      'UPDATE movies SET imdb_id = ?, imdb_rating = ?, poster_path = ? WHERE id = ?',
      p.newImdbId, rating, p.best.posterPath || null, p.film.id
    );
    written++;
    console.log(`  wrote ${p.film.title} -> ${p.newImdbId}${rating != null ? ` (rating ${rating})` : ''}`);
  }
  console.log(`\nUpdated ${written} films.`);
  process.exit(0);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
