// Returns formatted score like "7,50" (no /10 suffix)
export function fmt(v, d = 2) {
  if (v == null) return '–';
  return v.toFixed(d).replace('.', ',');
}

// Returns formatted score like "7,50/10" (with /10 suffix, for card displays)
export function fmtScore10(v) {
  if (v == null) return '–';
  return v.toFixed(2).replace('.', ',') + '/10';
}

export function scoreClass(v) {
  if (v == null) return 'score-none';
  if (v >= 7.5) return 'score-high';
  if (v >= 5)   return 'score-mid';
  return 'score-low';
}

export function fmtScore(v) {
  if (v == null) return '–';
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

// TMDB serves posters at fixed, documented widths off its own CDN, so we store
// only the bare path (e.g. '/3bhkrj58Vtu7enYsRolD1fZdja1.jpg') and pick the
// width here. Measured for one poster: w92 3 KB, w185 7 KB, w500 33 KB — worth
// asking for the size you'll actually display rather than scaling in CSS.
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/';
export const POSTER_SIZES = ['w92', 'w154', 'w185', 'w342', 'w500', 'w780', 'original'];

export function posterUrl(path, size = 'w185') {
  if (!path) return null;
  return `${TMDB_IMAGE_BASE}${POSTER_SIZES.includes(size) ? size : 'w185'}${path}`;
}

export const BACKDROP_SIZES = ['w300', 'w780', 'w1280', 'original'];
export function backdropUrl(path, size = 'w1280') {
  if (!path) return null;
  return `${TMDB_IMAGE_BASE}${BACKDROP_SIZES.includes(size) ? size : 'w1280'}${path}`;
}

// Pull an IMDb id out of anything the user pastes: a full URL, a bare id, or a fragment.
// e.g. "https://www.imdb.com/title/tt6751668/?ref_=fn_1" -> "tt6751668". Returns '' if none.
export function extractImdbId(input) {
  const match = String(input || '').match(/tt\d{6,}/i);
  return match ? match[0].toLowerCase() : '';
}

// Formats runtime in minutes to human-readable duration, e.g. 142 -> "2h 22m", 85 -> "1h 25m", 45 -> "45m"
export function formatRuntime(minutes) {
  if (minutes == null || minutes === '') return null;
  const num = typeof minutes === 'number' ? minutes : parseInt(minutes, 10);
  if (!num || isNaN(num) || num <= 0) return null;
  const h = Math.floor(num / 60);
  const m = num % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// Greek to Latin transliteration table for Greeklish search support
const GREEK_CHAR_MAP = {
  α: 'a', β: 'v', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'i', θ: 'th',
  ι: 'i', κ: 'k', λ: 'l', μ: 'm', ν: 'n', ξ: 'x', ο: 'o', π: 'p',
  ρ: 'r', σ: 's', ς: 's', τ: 't', υ: 'y', φ: 'f', χ: 'ch', ψ: 'ps', ω: 'o',
  ά: 'a', έ: 'e', ή: 'i', ί: 'i', ό: 'o', ύ: 'y', ώ: 'o',
  ϊ: 'i', ϋ: 'y', ΐ: 'i', ΰ: 'y',
};

export function transliterateGreek(text) {
  if (!text) return '';
  let out = '';
  const lower = String(text).toLowerCase().replace(/[οό][υύ]/g, 'ou');
  for (const char of lower) {
    out += GREEK_CHAR_MAP[char] ?? char;
  }
  return out;
}

export function normalizeSearchText(text) {
  if (!text) return '';
  return String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Robust movie search matcher:
 * - Multi-token: Every word in the query must match title, director, year, or keywords.
 * - Diacritic-insensitive: Strips accents and tones (e.g. Amélie -> amelie, Βοσκοί -> βοσκοι).
 * - Greeklish-aware: Matches Greek titles when searched in Latin characters (e.g. voskoi -> Οι Βοσκοί).
 * - Trims whitespace safely.
 * - 100% immune to null directors or malformed keyword structures.
 */
export function matchesMovieSearch(movie, searchQuery) {
  if (!searchQuery || !searchQuery.trim()) return true;
  if (!movie) return false;

  const rawTokens = searchQuery.trim().split(/\s+/).filter(Boolean);
  const normalizedTokens = rawTokens.map(normalizeSearchText);
  if (!normalizedTokens.length) return true;

  const kwList = Array.isArray(movie.keywords)
    ? movie.keywords.map(k => typeof k === 'string' ? k : (k?.name || '')).filter(Boolean)
    : [];

  const rawStrings = [
    movie.title,
    movie.director,
    movie.year != null ? String(movie.year) : '',
    ...kwList
  ].filter(Boolean);

  const corpusPieces = [];
  for (const s of rawStrings) {
    const norm = normalizeSearchText(s);
    corpusPieces.push(norm);
    const trans = transliterateGreek(s);
    if (trans && trans !== norm) {
      corpusPieces.push(normalizeSearchText(trans));
    }
  }

  const corpus = corpusPieces.join(' ');
  return normalizedTokens.every(token => corpus.includes(token));
}
