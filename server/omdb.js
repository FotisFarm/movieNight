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

module.exports = { lookupImdb };
