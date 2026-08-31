// TMDB is the *image* provider. OMDb keeps its existing job (identity:
// imdb_id, imdb_rating, the tuned fuzzy title matching in omdb.js) — this
// module only ever answers "what poster goes with this film?".
//
// Why TMDB and not OMDb's poster URLs: OMDb hands back whatever Amazon size
// happens to be stored, which varies 13-45 KB for the same UI slot with no
// way to ask for a specific width. TMDB serves documented, stable sizes off
// its own CDN (w92 3 KB / w185 7 KB / w500 33 KB, measured), so we store the
// bare path and choose the width at render time.
//
// TMDB_API_KEY accepts either a v3 API key or a v4 read access token; the
// shape tells them apart. Unset key -> every helper degrades to null and the
// app works without posters, same pattern as OMDB_API_KEY.

const TMDB_KEY = process.env.TMDB_API_KEY;
const API = 'https://api.themoviedb.org/3';

// v4 read tokens are JWTs (three dot-separated segments) and go in the
// Authorization header; v3 keys are opaque and go in the query string.
const isV4 = () => Boolean(TMDB_KEY) && TMDB_KEY.split('.').length === 3;

async function tmdbFetch(path, params = {}) {
  if (!TMDB_KEY) return null;
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  }
  if (!isV4()) url.searchParams.set('api_key', TMDB_KEY);
  const res = await fetch(url, { headers: isV4() ? { Authorization: `Bearer ${TMDB_KEY}` } : {} });
  if (!res.ok) return null;
  return res.json();
}

// Shapes a TMDB movie record down to the fields we care about.
function toMovie(record) {
  if (!record) return null;
  return {
    tmdbId: record.id,
    title: record.title || '',
    originalTitle: record.original_title || '',
    year: record.release_date ? record.release_date.slice(0, 4) : '',
    posterPath: record.poster_path || null,
  };
}

// The main path: we already store imdb_id for most films, and TMDB indexes by
// it, so this is an exact lookup with no fuzzy matching to get wrong.
async function findByImdbId(rawImdbId) {
  const imdbId = String(rawImdbId || '').trim();
  if (!imdbId) return null;
  try {
    const data = await tmdbFetch(`/find/${encodeURIComponent(imdbId)}`, { external_source: 'imdb_id' });
    return toMovie((data?.movie_results || [])[0]);
  } catch {
    return null;
  }
}

// Fallback for films whose imdb_id is missing or wrong — used by the
// id-repair script, not by the normal add/edit flow.
async function searchMovie(title, year) {
  if (!title) return [];
  try {
    const data = await tmdbFetch('/search/movie', {
      query: title,
      year: year ? String(year).slice(0, 4) : undefined,
    });
    return (data?.results || []).map(toMovie).filter(Boolean);
  } catch {
    return [];
  }
}

// TMDB's own external-ids endpoint, so a film matched by title can be tied
// back to the IMDb id we store.
async function getExternalIds(tmdbId) {
  if (!tmdbId) return null;
  try {
    const data = await tmdbFetch(`/movie/${tmdbId}/external_ids`);
    return data ? { imdbId: data.imdb_id || null } : null;
  } catch {
    return null;
  }
}

// Convenience for the add/edit flow: best-effort poster path for a film,
// preferring the exact imdb_id lookup and falling back to a title search.
async function lookupPosterPath(imdbId, title, year) {
  const byId = await findByImdbId(imdbId);
  if (byId?.posterPath) return byId.posterPath;
  if (!title) return null;
  const [first] = await searchMovie(title, year);
  return first?.posterPath || null;
}

module.exports = { findByImdbId, searchMovie, getExternalIds, lookupPosterPath };
