// Fetches imdb_rating for films that already have imdb_id but no rating yet.
// Uses ?i= (by ID) — exact, no guessing. Run this first.
// Usage: OMDB_API_KEY=fa8ade43 node server/scripts/fetch-ratings-by-id.js
const db = require('../db');

const OMDB_KEY = process.env.OMDB_API_KEY;
if (!OMDB_KEY) { console.error('Set OMDB_API_KEY env var'); process.exit(1); }

const movies = db.prepare('SELECT id, title, imdb_id FROM movies WHERE imdb_id IS NOT NULL AND imdb_rating IS NULL').all();
const update = db.prepare('UPDATE movies SET imdb_rating = ? WHERE id = ?');

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  console.log(`Fetching ratings for ${movies.length} already-matched films…\n`);
  let done = 0, missing = 0;

  for (const m of movies) {
    const url = `https://www.omdbapi.com/?i=${m.imdb_id}&apikey=${OMDB_KEY}`;
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (data.Response === 'True') {
        const rating = data.imdbRating !== 'N/A' ? parseFloat(data.imdbRating) : null;
        update.run(rating, m.id);
        done++;
        console.log(`✓ ${m.title} → ${rating ?? 'no rating'}`);
      } else {
        missing++;
        console.log(`✗ ${m.title} — ${data.Error}`);
      }
    } catch (e) {
      missing++;
      console.log(`! ${m.title} — ${e.message}`);
    }
    await sleep(120);
  }

  console.log(`\n── Done ── Updated: ${done}, Skipped: ${missing}`);
}

main();
