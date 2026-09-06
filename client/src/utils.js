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
