const OMDB_KEY = process.env.OMDB_API_KEY;

async function lookupImdb(title, year) {
  if (!OMDB_KEY) return null;
  try {
    const url = `https://www.omdbapi.com/?t=${encodeURIComponent(title)}&y=${encodeURIComponent(year)}&apikey=${OMDB_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.Response !== 'True') return null;
    return {
      imdbId: data.imdbID,
      imdbRating: data.imdbRating !== 'N/A' ? parseFloat(data.imdbRating) : null,
    };
  } catch {
    return null;
  }
}

async function omdbSearch(query, year) {
  const y = year ? `&y=${encodeURIComponent(year)}` : '';
  const url = `https://www.omdbapi.com/?s=${encodeURIComponent(query)}&type=movie${y}&apikey=${OMDB_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.Response !== 'True' || !Array.isArray(data.Search)) return [];
  return data.Search.map(s => ({
    imdbId: s.imdbID,
    title: s.Title,
    year: s.Year,
    poster: s.Poster && s.Poster !== 'N/A' ? s.Poster : null,
  }));
}

const STOP_WORDS = new Set(['the', 'a', 'an', 'of', 'and', 'in', 'on', 'to', 'for']);
const normalize = s => (s || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();

// Levenshtein edit distance, capped by early exit on the row minimum.
function editDistance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(
        prev[j] + 1,                                   // deletion
        row[j - 1] + 1,                                // insertion
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1), // substitution
      );
    }
    prev = row;
  }
  return prev[b.length];
}

// Lower is better. Edit distance to the typed title, normalised by length, plus a year penalty.
function candidateScore(candidate, typedTitle, typedYear) {
  const a = normalize(candidate.title);
  const b = normalize(typedTitle);
  const dist = editDistance(a, b) / Math.max(a.length, b.length, 1);
  let penalty = 0;
  if (typedYear) {
    const cy = parseInt(String(candidate.year).slice(0, 4));
    const ty = parseInt(String(typedYear).slice(0, 4));
    if (Number.isFinite(cy) && Number.isFinite(ty)) {
      penalty = cy === ty ? 0 : Math.min(0.3, Math.abs(cy - ty) * 0.02);
    }
  }
  return dist + penalty;
}

// OMDb's `s=` matches whole words only — a typo inside a word returns nothing at all.
// When the full query misses, retry with each correctly-spelled word on its own; a title
// with one good word ("Shawshank Redemtion" -> "Shawshank") still finds the film.
async function tokenDropSearch(query) {
  const words = normalize(query)
    .split(' ')
    .filter(w => w.length >= 4 && !STOP_WORDS.has(w))
    .sort((a, b) => b.length - a.length);

  const seen = new Map();
  for (const word of words) {
    for (const hit of await omdbSearch(word, '')) {
      if (!seen.has(hit.imdbId)) seen.set(hit.imdbId, hit);
    }
    if (seen.size >= 20) break; // enough to rank; don't burn more API calls
  }
  return [...seen.values()];
}

// A close match scores near 0. Above WIDEN_ABOVE the result set is poor enough to be worth
// spending extra API calls on; above MAX_SCORE a candidate is unrelated noise, not a suggestion.
const WIDEN_ABOVE = 0.15;
const MAX_SCORE = 0.40;

async function searchImdb(query, year) {
  if (!OMDB_KEY) return [];
  try {
    // Tier 1: exact query + year. Tier 2: drop the year (a typo + strict year finds nothing).
    let results = await omdbSearch(query, year);
    if (!results.length && year) results = await omdbSearch(query, '');

    // Tier 3: word-by-word retry, for typos inside a word. Also fires when tier 1/2 only
    // returned weak matches — OMDb happily returns a documentary short for the real film.
    const score = r => candidateScore(r, query, year);
    const best = results.length ? Math.min(...results.map(score)) : Infinity;
    if (best > WIDEN_ABOVE) {
      const seen = new Map(results.map(r => [r.imdbId, r]));
      for (const hit of await tokenDropSearch(query)) {
        if (!seen.has(hit.imdbId)) seen.set(hit.imdbId, hit);
      }
      results = [...seen.values()];
    }

    return results
      .map(r => ({ ...r, _score: score(r) }))
      .filter(r => r._score <= MAX_SCORE)
      .sort((a, b) => a._score - b._score)
      .slice(0, 8)
      .map(({ _score, ...r }) => r);
  } catch {
    return [];
  }
}

// Accept a full IMDb URL, a bare id, or any fragment containing one.
function extractImdbId(input) {
  const match = String(input || '').match(/tt\d{6,}/i);
  return match ? match[0].toLowerCase() : '';
}

async function getImdbById(rawId) {
  const imdbId = extractImdbId(rawId);
  if (!OMDB_KEY || !imdbId) return null;
  try {
    const url = `https://www.omdbapi.com/?i=${encodeURIComponent(imdbId)}&apikey=${OMDB_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.Response !== 'True') return null;
    return {
      imdbId: data.imdbID,
      title: data.Title,
      year: data.Year,
      director: data.Director && data.Director !== 'N/A' ? data.Director : '',
      imdbRating: data.imdbRating !== 'N/A' ? parseFloat(data.imdbRating) : null,
    };
  } catch {
    return null;
  }
}

module.exports = { lookupImdb, searchImdb, getImdbById, extractImdbId };
