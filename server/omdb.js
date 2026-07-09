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

async function searchImdb(query, year) {
  if (!OMDB_KEY) return [];
  try {
    // A year filter narrows correct titles, but a misspelling + strict year returns nothing —
    // fall back to a title-only search so typos still surface candidates.
    let results = await omdbSearch(query, year);
    if (!results.length && year) results = await omdbSearch(query, '');
    return results.slice(0, 8);
  } catch {
    return [];
  }
}

async function getImdbById(imdbId) {
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

module.exports = { lookupImdb, searchImdb, getImdbById };
