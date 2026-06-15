// Queries OMDb for all films missing imdb_id
// Usage: OMDB_API_KEY=fa8ade43 node server/scripts/batch-omdb.js
const db = require('../db');

const OMDB_KEY = process.env.OMDB_API_KEY;
if (!OMDB_KEY) { console.error('Set OMDB_API_KEY env var'); process.exit(1); }

const movies = db.prepare('SELECT id, title, year FROM movies WHERE imdb_rating IS NULL').all();
const update = db.prepare('UPDATE movies SET imdb_id = ?, imdb_rating = ? WHERE id = ?');

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  console.log(`Querying OMDb for ${movies.length} films…\n`);
  let matched = 0, unmatched = [];

  for (const m of movies) {
    const url = `https://www.omdbapi.com/?t=${encodeURIComponent(m.title)}&y=${encodeURIComponent(m.year)}&apikey=${OMDB_KEY}`;
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (data.Response === 'True') {
        const rating = data.imdbRating !== 'N/A' ? parseFloat(data.imdbRating) : null;
        update.run(data.imdbID, rating, m.id);
        matched++;
        console.log(`✓ ${m.title} (${m.year}) → ${data.imdbID} [${rating ?? 'no rating'}]`);
      } else {
        unmatched.push(`${m.title} (${m.year})`);
        console.log(`✗ ${m.title} (${m.year})`);
      }
    } catch (e) {
      unmatched.push(`${m.title} (${m.year}) [error: ${e.message}]`);
    }
    await sleep(120); // stay well under 1000/day free limit
  }

  console.log(`\n── Done ──`);
  console.log(`Matched:   ${matched}`);
  console.log(`Unmatched: ${unmatched.length}`);
  if (unmatched.length) {
    console.log('\nUnmatched films (fix manually in the app):');
    unmatched.forEach(t => console.log(`  - ${t}`));
  }
}

main();
