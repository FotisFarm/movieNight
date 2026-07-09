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

// Pull an IMDb id out of anything the user pastes: a full URL, a bare id, or a fragment.
// e.g. "https://www.imdb.com/title/tt6751668/?ref_=fn_1" -> "tt6751668". Returns '' if none.
export function extractImdbId(input) {
  const match = String(input || '').match(/tt\d{6,}/i);
  return match ? match[0].toLowerCase() : '';
}
