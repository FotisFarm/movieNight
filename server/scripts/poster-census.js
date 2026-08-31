#!/usr/bin/env node
/*
 * Poster coverage census — how many of our films can actually get a poster,
 * from OMDb (plan B) and/or TMDB (plan A), before committing to either.
 *
 * Reads data/seed.json rather than the DB, so it needs no Turso credentials.
 * seed.json is regenerated nightly from prod, so it's an accurate picture of
 * the real collection to within a day.
 *
 * Every answer is cached to disk and re-used on the next run. That matters:
 * OMDb's free tier allows 1,000 requests/day and a full census of the ~888
 * films holding an imdb_id spends most of it, so a re-run must never pay
 * twice for the same film.
 *
 *   node server/scripts/poster-census.js --provider=both
 *   node server/scripts/poster-census.js --provider=tmdb --limit=25
 *
 * Flags:
 *   --provider=omdb|tmdb|both   which API(s) to ask        (default: both)
 *   --limit=N                   only check the first N films (a cheap dry run)
 *   --cache=PATH                where to keep answers      (default: alongside this script)
 *   --report=PATH               where to write the JSON report
 *   --force                     ignore the cache and re-query everything
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env'), quiet: true });
const fs = require('fs');
const path = require('path');

const OMDB_KEY = process.env.OMDB_API_KEY;
const TMDB_KEY = process.env.TMDB_API_KEY;

const SEED_PATH = path.join(__dirname, '..', 'data', 'seed.json');

// Parses `--flag=value` / `--flag` argv into a plain object.
function parseArgs(argv) {
  const out = {};
  for (const arg of argv) {
    const m = arg.match(/^--([^=]+)(?:=(.*))?$/);
    if (m) out[m[1]] = m[2] === undefined ? true : m[2];
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const PROVIDER = String(args.provider || 'both').toLowerCase();
const LIMIT = args.limit ? parseInt(args.limit, 10) : null;
const CACHE_PATH = args.cache || path.join(__dirname, 'poster-census-cache.json');
const REPORT_PATH = args.report || path.join(__dirname, 'poster-census-report.json');
const FORCE = Boolean(args.force);

const wantOmdb = PROVIDER === 'omdb' || PROVIDER === 'both';
const wantTmdb = PROVIDER === 'tmdb' || PROVIDER === 'both';

// ── cache ──────────────────────────────────────────────────────────────────
function loadCache() {
  if (FORCE) return { omdb: {}, tmdb: {} };
  try {
    const parsed = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
    return { omdb: parsed.omdb || {}, tmdb: parsed.tmdb || {} };
  } catch {
    return { omdb: {}, tmdb: {} };
  }
}

function saveCache(cache) {
  fs.writeFileSync(CACHE_PATH, `${JSON.stringify(cache, null, 2)}\n`, 'utf8');
}

// ── providers ──────────────────────────────────────────────────────────────
// Both return { ok, poster } — `poster` is null when the provider has no image.
// `ok: false` means the call itself failed (quota, network), which must never
// be recorded as "this film has no poster".

async function omdbPoster(imdbId) {
  const url = `https://www.omdbapi.com/?i=${encodeURIComponent(imdbId)}&apikey=${OMDB_KEY}`;
  const res = await fetch(url);
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
  const data = await res.json();
  if (data.Response !== 'True') {
    // OMDb reports a spent quota as a normal 200 with Response:"False".
    return { ok: false, error: data.Error || 'Response False' };
  }
  const poster = data.Poster && data.Poster !== 'N/A' ? data.Poster : null;
  return { ok: true, poster };
}

async function tmdbPoster(imdbId) {
  const url = `https://api.themoviedb.org/3/find/${encodeURIComponent(imdbId)}?external_source=imdb_id`;
  // A v4 read token goes in the Authorization header; a v3 key goes in the
  // query string. Accept whichever the user has to hand.
  const isV4 = TMDB_KEY && TMDB_KEY.split('.').length === 3;
  const res = await fetch(isV4 ? url : `${url}&api_key=${encodeURIComponent(TMDB_KEY)}`, {
    headers: isV4 ? { Authorization: `Bearer ${TMDB_KEY}` } : {},
  });
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
  const data = await res.json();
  const hit = (data.movie_results || [])[0];
  if (!hit) return { ok: true, poster: null, unmatched: true };
  return { ok: true, poster: hit.poster_path || null, tmdbId: hit.id };
}

// Runs `worker` over `items` with at most `concurrency` in flight.
async function mapLimit(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        results[index] = await worker(items[index], index);
      }
    })
  );
  return results;
}

// ── census ─────────────────────────────────────────────────────────────────
async function census(label, films, cache, fetcher, concurrency) {
  const todo = films.filter(f => cache[f.imdb_id] === undefined);
  process.stdout.write(
    `\n${label}: ${films.length} films, ${films.length - todo.length} cached, ${todo.length} to fetch\n`
  );

  let done = 0;
  let failures = 0;
  let aborted = null;

  await mapLimit(todo, concurrency, async (film) => {
    if (aborted) return;
    try {
      const result = await fetcher(film.imdb_id);
      if (!result.ok) {
        failures++;
        // A run of failures almost always means the quota is gone — stop
        // rather than hammer the API and poison the cache with false misses.
        if (failures >= 5) aborted = result.error;
        return;
      }
      failures = 0;
      cache[film.imdb_id] = { poster: result.poster, unmatched: result.unmatched || false };
    } catch (err) {
      failures++;
      if (failures >= 5) aborted = err.message;
    }
    done++;
    if (done % 25 === 0) {
      process.stdout.write(`  ${done}/${todo.length}\r`);
      saveCache(fullCache);
    }
  });

  saveCache(fullCache);
  if (aborted) {
    console.log(`  ⚠ stopped early after repeated failures: ${aborted}`);
    console.log('    (progress is cached — re-run to resume where it left off)');
  }

  const checked = films.filter(f => cache[f.imdb_id] !== undefined);
  const withPoster = checked.filter(f => cache[f.imdb_id].poster);
  const without = checked.filter(f => !cache[f.imdb_id].poster);

  return {
    provider: label,
    checked: checked.length,
    notChecked: films.length - checked.length,
    withPoster: withPoster.length,
    withoutPoster: without.length,
    coverage: checked.length ? +(withPoster.length / checked.length * 100).toFixed(1) : 0,
    missing: without.map(f => ({
      title: f.movie,
      year: f.year,
      imdb_id: f.imdb_id,
      unmatched: cache[f.imdb_id].unmatched,
    })),
  };
}

let fullCache;

(async () => {
  const raw = fs.readFileSync(SEED_PATH, 'utf8').replace(/^﻿/, '');
  const allFilms = JSON.parse(raw);
  let films = allFilms.filter(f => f.imdb_id);
  if (LIMIT) films = films.slice(0, LIMIT);

  console.log(`Collection: ${allFilms.length} films, ${films.length} with an imdb_id to check`);

  if (wantOmdb && !OMDB_KEY) throw new Error('OMDB_API_KEY is not set');
  if (wantTmdb && !TMDB_KEY) throw new Error('TMDB_API_KEY is not set — see the README note in this file');

  fullCache = loadCache();
  const report = { generatedAt: new Date().toISOString(), films: films.length, results: {} };

  // TMDB first: no daily cap, so it's the free one to run.
  if (wantTmdb) {
    report.results.tmdb = await census('TMDB', films, fullCache.tmdb, tmdbPoster, 20);
  }
  // OMDb second, gently — 1,000 requests/day on the free tier.
  if (wantOmdb) {
    report.results.omdb = await census('OMDb', films, fullCache.omdb, omdbPoster, 4);
  }

  console.log('\n─── Coverage ───');
  for (const r of Object.values(report.results)) {
    console.log(
      `${r.provider.padEnd(5)} ${String(r.withPoster).padStart(4)}/${String(r.checked).padEnd(4)} = ${r.coverage}%` +
      `${r.notChecked ? `  (${r.notChecked} not checked)` : ''}`
    );
  }

  // Where the two providers disagree is the interesting part: films only one
  // of them can illustrate, which is what a fallback would have to cover.
  if (report.results.tmdb && report.results.omdb) {
    const tmdbHas = id => fullCache.tmdb[id]?.poster;
    const omdbHas = id => fullCache.omdb[id]?.poster;
    const both = films.filter(f => fullCache.tmdb[f.imdb_id] && fullCache.omdb[f.imdb_id]);
    const onlyTmdb = both.filter(f => tmdbHas(f.imdb_id) && !omdbHas(f.imdb_id));
    const onlyOmdb = both.filter(f => !tmdbHas(f.imdb_id) && omdbHas(f.imdb_id));
    const neither = both.filter(f => !tmdbHas(f.imdb_id) && !omdbHas(f.imdb_id));
    report.overlap = {
      comparable: both.length,
      onlyTmdb: onlyTmdb.map(f => `${f.movie} (${f.year})`),
      onlyOmdb: onlyOmdb.map(f => `${f.movie} (${f.year})`),
      neither: neither.map(f => `${f.movie} (${f.year})`),
    };
    console.log(`\nOf ${both.length} films checked by both:`);
    console.log(`  TMDB only : ${onlyTmdb.length}`);
    console.log(`  OMDb only : ${onlyOmdb.length}`);
    console.log(`  neither   : ${neither.length}`);
  }

  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`\nReport -> ${REPORT_PATH}`);
})().catch(err => {
  console.error(err.message);
  process.exit(1);
});
