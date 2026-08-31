#!/usr/bin/env node
/*
 * Resolves films that have no imdb_id at all.
 *
 * These are the ones OMDb could never find: its ?s= search matches whole words
 * only, so a typo inside a word ("Breathlless", "Felini Satyricon") returns
 * nothing, and its index is weak on original-language titles ("Le notte di
 * Cabiria") and loose translations ("My Life to Live" for Vivre sa vie).
 *
 * The way through is a signal OMDb never used: we store a director and a year
 * for every one of these films. So rather than only asking "what film is
 * called X?", this also asks "what did this director release that year?" —
 * a question that survives both typos and translated titles.
 *
 * Three strategies, best match wins:
 *   1. TMDB title search + year        (fuzzy, unlike OMDb's whole-word match)
 *   2. TMDB title search, no year      (for films whose recorded year is off)
 *   3. the director's filmography      (typo-proof and translation-proof)
 *
 * Nothing is written without --apply, and only matches confident enough to be
 * automatic are written; the rest print for a human.
 *
 *   node server/scripts/resolve-missing-ids.js
 *   node server/scripts/resolve-missing-ids.js --apply
 *
 * Flags:
 *   --apply       write imdb_id / poster_path (and imdb_rating, see --ratings)
 *   --ratings     also fetch imdb_rating from OMDb — costs one OMDb call per
 *                 film written, against a 1,000/day free-tier budget
 *   --limit=N     only examine the first N films
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env'), quiet: true });
const db = require('../db');
const { searchMovie, getExternalIds } = require('../tmdb');
const { getImdbById } = require('../omdb');

const args = Object.fromEntries(
  process.argv.slice(2)
    .map(a => a.match(/^--([^=]+)(?:=(.*))?$/))
    .filter(Boolean)
    .map(m => [m[1], m[2] === undefined ? true : m[2]])
);

const APPLY = Boolean(args.apply);
const RATINGS = Boolean(args.ratings);
const LIMIT = args.limit ? parseInt(args.limit, 10) : null;

const TMDB_KEY = process.env.TMDB_API_KEY;
const API = 'https://api.themoviedb.org/3';
const isV4 = () => Boolean(TMDB_KEY) && TMDB_KEY.split('.').length === 3;

async function tmdb(path, params = {}) {
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  }
  if (!isV4()) url.searchParams.set('api_key', TMDB_KEY);
  const res = await fetch(url, { headers: isV4() ? { Authorization: `Bearer ${TMDB_KEY}` } : {} });
  if (!res.ok) return null;
  return res.json();
}

const norm = s => (s || '').toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]/gu, '');

// Levenshtein, normalised by length: 0 is identical, 1 is nothing in common.
function editDistance(a, b) {
  if (a === b) return 0;
  if (!a.length || !b.length) return Math.max(a.length, b.length);
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length];
}

function titleDistance(ours, theirs) {
  const a = norm(ours);
  const b = norm(theirs);
  if (!a || !b) return 1;
  if (a === b) return 0;
  return editDistance(a, b) / Math.max(a.length, b.length);
}

// Best (lowest) distance against either the localised or the original title —
// our collection stores a mix of both.
function bestTitleDistance(ourTitle, candidate) {
  return Math.min(
    titleDistance(ourTitle, candidate.title),
    titleDistance(ourTitle, candidate.originalTitle || candidate.original_title || '')
  );
}

const yearOf = v => parseInt(String(v || '').slice(0, 4));
function yearGap(a, b) {
  const x = yearOf(a); const y = yearOf(b);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return 99;
  return Math.abs(x - y);
}

// ── strategy 3: the director's own filmography ──
// Cached per director: 200 films span far fewer directors, and the credits
// call is the expensive one.
const directorCache = new Map();

async function directorFilmography(name) {
  const key = norm(name);
  if (!key) return [];
  if (directorCache.has(key)) return directorCache.get(key);

  let films = [];
  const people = await tmdb('/search/person', { query: name });
  const person = (people?.results || [])[0];
  if (person) {
    const credits = await tmdb(`/person/${person.id}/movie_credits`);
    films = (credits?.crew || [])
      .filter(c => c.job === 'Director')
      .map(c => ({
        tmdbId: c.id,
        title: c.title || '',
        originalTitle: c.original_title || '',
        year: c.release_date ? c.release_date.slice(0, 4) : '',
        posterPath: c.poster_path || null,
        via: 'director',
      }));
  }
  directorCache.set(key, films);
  return films;
}

// Does TMDB credit this candidate to the director we have on file?
//
// Deliberately lenient, because a mismatch here only *blocks* an automatic
// write — it never causes one. Our director strings are a mix of scripts and
// conventions ("Θόδωρος Αγγελόπουλος" against TMDB's "Theo Angelopoulos",
// "Coen Brothers" against "Joel Coen, Ethan Coen", "Bong Joon-ho" against
// "Bong Joon Ho"), so surname-token overlap is the widest net that still
// rejects an outright different person. An unknown director passes: absence
// of evidence isn't evidence of a wrong match.
// norm() strips spaces too, which is right for titles and wrong for names —
// this one keeps word boundaries so surnames stay comparable.
const normName = s => (s || '').toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}\s]/gu, " ")
  .replace(/\s+/g, ' ').trim();

const hasGreek = s => /[Ͱ-Ͽἀ-῿]/.test(s);
const hasLatin = s => /[a-z]/.test(s);

// Two names written in different alphabets share no comparable characters, so
// no string test can tell "Θόδωρος Αγγελόπουλος" from "Theo Angelopoulos"
// apart from a genuinely different person. Treat that as no evidence rather
// than as disagreement — otherwise every Greek film in the collection is
// blocked over a transliteration.
function comparableScripts(a, b) {
  if (hasGreek(a) && !hasGreek(b) && hasLatin(b)) return false;
  if (hasGreek(b) && !hasGreek(a) && hasLatin(a)) return false;
  return true;
}

async function directorAgrees(candidate, ourDirector) {
  const ours = normName(ourDirector);
  if (!ours) return true;
  const credits = await tmdb(`/movie/${candidate.tmdbId}/credits`);
  const names = (credits?.crew || []).filter(c => c.job === 'Director').map(c => normName(c.name));
  if (!names.length) return true;
  if (names.some(n => n === ours || n.includes(ours) || ours.includes(n))) return true;
  // Compare surname tokens — the part most likely to survive transliteration.
  const surnames = ours.split(' ').filter(w => w.length > 3);
  if (surnames.length && names.some(n => n.split(' ').some(w => surnames.includes(w)))) return true;
  // Nothing matched. Only call that a disagreement if the two were written in
  // the same alphabet and so were actually comparable.
  return !names.some(n => comparableScripts(ours, n));
}

// Scores a candidate: lower is better. Title distance dominates; a year that
// disagrees is penalised but not fatal, since our recorded years drift.
function score(film, candidate) {
  const dist = bestTitleDistance(film.title, candidate);
  const gap = yearGap(film.year, candidate.year);
  return dist + Math.min(0.5, gap * 0.06);
}

async function bestCandidate(film) {
  const pool = new Map();
  const add = (list, via) => {
    for (const c of list || []) {
      const key = c.tmdbId;
      if (!pool.has(key)) pool.set(key, { ...c, via: c.via || via });
    }
  };

  add(await searchMovie(film.title, film.year), 'title+year');
  add(await searchMovie(film.title, ''), 'title');

  // The director's filmography, narrowed to films near the recorded year.
  if (film.director) {
    const all = await directorFilmography(film.director);
    add(all.filter(c => yearGap(film.year, c.year) <= 2), 'director');
  }

  const scored = [...pool.values()]
    .map(c => ({ ...c, _score: score(film, c) }))
    .sort((a, b) => a._score - b._score);

  return scored[0] || null;
}

(async () => {
  if (!TMDB_KEY) throw new Error('TMDB_API_KEY is not set');
  await db.init();

  let films = await db.all(
    "SELECT id, title, year, director FROM movies WHERE imdb_id IS NULL OR imdb_id = '' ORDER BY director, year"
  );
  if (LIMIT) films = films.slice(0, LIMIT);
  console.log(`${films.length} films with no imdb_id\n`);

  const confident = [];
  const review = [];
  const nothing = [];

  let done = 0;
  for (const film of films) {
    const best = await bestCandidate(film);
    done++;
    if (done % 25 === 0) process.stdout.write(`  ${done}/${films.length}\r`);

    if (!best) { nothing.push({ film }); continue; }

    const external = await getExternalIds(best.tmdbId);
    const imdbId = external?.imdbId || null;
    const dist = bestTitleDistance(film.title, best);
    const gap = yearGap(film.year, best.year);

    // Confident when the title is close and the year agrees, OR when the
    // director's own filmography pins an exact year — that combination is
    // hard to get wrong even when the title is a translation.
    //
    // The title path additionally requires the director to agree. Without
    // that check it matched "Summer in the City" (1970, Wim Wenders) to a
    // different 1970 film of the same name by Christian Blackwood — same
    // title, same year, wrong film. A candidate reached through the
    // director's own filmography has already proved the director by
    // construction.
    const directorOk = best.via === 'director' || await directorAgrees(best, film.director);
    const strongTitle = dist <= 0.25 && gap <= 1 && directorOk;
    const directorPin = best.via === 'director' && gap === 0 && dist <= 0.6;
    const entry = { film, best, imdbId, dist: +dist.toFixed(2), gap };

    if (!imdbId) review.push({ ...entry, why: 'TMDB has no imdb_id for this film' });
    else if (strongTitle || directorPin) confident.push(entry);
    else review.push({ ...entry, why: `title distance ${dist.toFixed(2)}, year gap ${gap}` });
  }

  const show = e =>
    `  ${(e.film.title || '').slice(0, 38).padEnd(40)}${String(e.film.year).padEnd(6)}` +
    `-> "${e.best.title}" (${e.best.year || '?'}) ${e.imdbId || 'no-imdb-id'}` +
    `${e.best.posterPath ? ' +poster' : ''}  [${e.best.via}]`;

  console.log(`\n── Confident (${confident.length}) ──`);
  confident.forEach(e => console.log(show(e)));

  console.log(`\n── Needs review (${review.length}) ──`);
  review.forEach(e => console.log(`${show(e)}  — ${e.why}`));

  if (nothing.length) {
    console.log(`\n── No candidate at all (${nothing.length}) ──`);
    nothing.forEach(e => console.log(`  ${e.film.title} (${e.film.year}) — ${e.film.director}`));
  }

  console.log(`\n${confident.length} confident / ${review.length} review / ${nothing.length} nothing, of ${films.length}`);

  if (!APPLY) {
    console.log('\nNothing written. Re-run with --apply to write the confident ones.');
    process.exit(0);
  }

  let written = 0;
  for (const e of confident) {
    let rating = null;
    if (RATINGS) {
      try { rating = (await getImdbById(e.imdbId))?.imdbRating ?? null; } catch (_) {}
    }
    await db.run(
      RATINGS
        ? 'UPDATE movies SET imdb_id = ?, poster_path = ?, imdb_rating = ? WHERE id = ?'
        : 'UPDATE movies SET imdb_id = ?, poster_path = ? WHERE id = ?',
      ...(RATINGS
        ? [e.imdbId, e.best.posterPath || null, rating, e.film.id]
        : [e.imdbId, e.best.posterPath || null, e.film.id])
    );
    written++;
  }
  console.log(`\nUpdated ${written} films.${RATINGS ? '' : '  (imdb_rating left alone — re-run with --ratings to fill it)'}`);
  process.exit(0);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
