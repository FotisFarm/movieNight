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
    backdropPath: record.backdrop_path || null,
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

// Convenience for the add/edit flow: best-effort media paths (poster & backdrop)
// preferring the exact imdb_id lookup and falling back to a title search.
async function lookupMediaPaths(imdbId, title, year) {
  const byId = await findByImdbId(imdbId);
  if (byId) {
    return {
      posterPath: byId.posterPath || null,
      backdropPath: byId.backdropPath || null,
      tmdbId: byId.tmdbId || null,
    };
  }
  if (!title) return { posterPath: null, backdropPath: null, tmdbId: null };
  const [first] = await searchMovie(title, year);
  return {
    posterPath: first?.posterPath || null,
    backdropPath: first?.backdropPath || null,
    tmdbId: first?.tmdbId || null,
  };
}

async function lookupPosterPath(imdbId, title, year) {
  const media = await lookupMediaPaths(imdbId, title, year);
  return media.posterPath;
}

async function lookupBackdropPath(imdbId, title, year) {
  const media = await lookupMediaPaths(imdbId, title, year);
  return media.backdropPath;
}

// Fetches full details including runtime and genres from TMDB
async function getMovieDetails(tmdbId) {
  if (!tmdbId) return null;
  try {
    const data = await tmdbFetch(`/movie/${tmdbId}`);
    return {
      runtime: typeof data?.runtime === 'number' && data.runtime > 0 ? data.runtime : null,
      genres: (data?.genres || []).map(g => g.name),
      overview: data?.overview || '',
    };
  } catch {
    return null;
  }
}

// Convenience helper to resolve runtime in minutes from TMDB
async function lookupMovieRuntime(imdbId, title, year) {
  if (imdbId) {
    const byId = await findByImdbId(imdbId);
    if (byId?.tmdbId) {
      const details = await getMovieDetails(byId.tmdbId);
      if (details?.runtime) return details.runtime;
    }
  }
  if (!title) return null;
  const [first] = await searchMovie(title, year);
  if (first?.tmdbId) {
    const details = await getMovieDetails(first.tmdbId);
    return details?.runtime || null;
  }
  return null;
}

// Fetches official YouTube trailer or teaser for a movie
async function getMovieTrailer(imdbId, title, year) {
  let tmdbId = null;
  if (imdbId) {
    const byId = await findByImdbId(imdbId);
    if (byId?.tmdbId) tmdbId = byId.tmdbId;
  }
  if (!tmdbId && title) {
    const [first] = await searchMovie(title, year);
    if (first?.tmdbId) tmdbId = first.tmdbId;
  }
  if (!tmdbId) return null;

  try {
    const data = await tmdbFetch(`/movie/${tmdbId}/videos`);
    const videos = data?.results || [];
    const ytVideos = videos.filter(v => v.site === 'YouTube' && v.key);
    if (ytVideos.length === 0) return null;

    // Pick best match: Official Trailer > Trailer > Official Teaser > Teaser > Clip
    const scored = ytVideos.map(v => {
      let score = 0;
      if (v.type === 'Trailer' && v.official) score = 100;
      else if (v.type === 'Trailer') score = 80;
      else if (v.type === 'Teaser' && v.official) score = 60;
      else if (v.type === 'Teaser') score = 40;
      else if (v.type === 'Clip') score = 20;
      return { ...v, score };
    });

    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];
    return {
      key: best.key,
      name: best.name,
      site: best.site,
      type: best.type,
      official: Boolean(best.official),
      youtubeUrl: `https://www.youtube.com/watch?v=${best.key}`,
      embedUrl: `https://www.youtube-nocookie.com/embed/${best.key}`,
    };
  } catch {
    return null;
  }
}

// Fetches streaming availability (flatrate, rent, buy) for a movie, defaulting to Greece (GR)
async function getMovieWatchProviders(imdbId, title, year, region = 'GR') {
  let tmdbId = null;
  if (imdbId) {
    const byId = await findByImdbId(imdbId);
    if (byId?.tmdbId) tmdbId = byId.tmdbId;
  }
  if (!tmdbId && title) {
    const [first] = await searchMovie(title, year);
    if (first?.tmdbId) tmdbId = first.tmdbId;
  }
  if (!tmdbId) return null;

  try {
    const data = await tmdbFetch(`/movie/${tmdbId}/watch/providers`);
    const regData = data?.results?.[region];
    const mapProvider = p => ({
      id: p.provider_id,
      name: p.provider_name,
      logoPath: p.logo_path || null,
      logoUrl: p.logo_path ? `https://image.tmdb.org/t/p/w92${p.logo_path}` : null,
      displayPriority: p.display_priority ?? 999,
    });

    if (!regData) {
      return {
        region,
        link: data?.results?.US?.link || data?.results?.GB?.link || null,
        flatrate: [],
        rent: [],
        buy: [],
        free: [],
      };
    }

    return {
      region,
      link: regData.link || null,
      flatrate: (regData.flatrate || []).map(mapProvider),
      rent: (regData.rent || []).map(mapProvider),
      buy: (regData.buy || []).map(mapProvider),
      free: (regData.free || []).map(mapProvider),
    };
  } catch {
    return null;
  }
}

module.exports = {
  findByImdbId,
  searchMovie,
  getExternalIds,
  lookupMediaPaths,
  lookupPosterPath,
  lookupBackdropPath,
  getMovieDetails,
  lookupMovieRuntime,
  getMovieTrailer,
  getMovieWatchProviders,
};

