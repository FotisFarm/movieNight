// Enriches films with IMDb ID + rating, prioritised by group score (boostedScore).
// Calls OMDb once per film (?t=title&y=year) — gets both imdb_id and imdb_rating in one request.
// Skips films that already have both fields. Stops cleanly on API limit (401/limit error).
// Usage: OMDB_API_KEY=<key> node server/scripts/enrich-priority.js
const db = require('../db');

const OMDB_KEY = process.env.OMDB_API_KEY;
if (!OMDB_KEY) { console.error('Set OMDB_API_KEY env var'); process.exit(1); }

const GROUP_SIZE = 5;
const rankBonus = r => (r >= 1 && r <= 10 ? (11 - r) / 10 : 0);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const updateStmt = db.prepare('UPDATE movies SET imdb_id = ?, imdb_rating = ? WHERE id = ?');

function getPrioritisedFilms() {
  const movies = db.prepare(
    'SELECT id, title, director, year, imdb_id, imdb_rating FROM movies WHERE NOT (imdb_id IS NOT NULL AND imdb_rating IS NOT NULL)'
  ).all();

  const ratingsMap = {};
  for (const r of db.prepare('SELECT movie_id, score FROM ratings').all()) {
    if (!ratingsMap[r.movie_id]) ratingsMap[r.movie_id] = [];
    ratingsMap[r.movie_id].push(r.score);
  }
  const top3Map = {};
  for (const t of db.prepare('SELECT movie_id, rank FROM top3').all()) {
    if (!top3Map[t.movie_id]) top3Map[t.movie_id] = [];
    top3Map[t.movie_id].push(t.rank);
  }

  return movies
    .map(m => {
      const scores = ratingsMap[m.id] || [];
      const boost  = (top3Map[m.id] || []).reduce((a, r) => a + rankBonus(r), 0);
      const sum    = scores.reduce((a, b) => a + b, 0);
      const boostedScore = scores.length >= 2
        ? Math.min(10, sum / GROUP_SIZE + boost)
        : -1;
      return { ...m, boostedScore, voters: scores.length };
    })
    .sort((a, b) => b.boostedScore - a.boostedScore || b.voters - a.voters);
}

async function fetchOmdb(title, year) {
  const params = new URLSearchParams({ t: title, type: 'movie', apikey: OMDB_KEY });
  if (year) params.set('y', year);
  const res = await fetch(`https://www.omdbapi.com/?${params}`);
  if (res.status === 401) throw new Error('API_LIMIT');
  return res.json();
}

async function main() {
  const films = getPrioritisedFilms();
  console.log(`${films.length} films to enrich (ordered by group score)\n`);

  let done = 0, failed = 0;

  for (const m of films) {
    try {
      const data = await fetchOmdb(m.title, m.year);

      if (data.Response === 'True' && data.imdbID) {
        const rating = data.imdbRating !== 'N/A' ? parseFloat(data.imdbRating) : null;
        updateStmt.run(data.imdbID, rating, m.id);
        done++;
        console.log(`✓ [${m.boostedScore >= 0 ? m.boostedScore.toFixed(2) : 'unrated'}] ${m.title} (${m.year}) → ${data.imdbID} | IMDb: ${rating ?? 'N/A'}`);
      } else {
        failed++;
        console.log(`✗ [${m.boostedScore >= 0 ? m.boostedScore.toFixed(2) : 'unrated'}] ${m.title} (${m.year}) — ${data.Error || 'not found'}`);
      }

      await sleep(200); // ~5 req/s, well within free tier
    } catch (e) {
      if (e.message === 'API_LIMIT') {
        console.error('\n⚠️  API limit reached — stopping. Run again tomorrow to continue.');
        break;
      }
      console.error(`  Error for "${m.title}": ${e.message}`);
      failed++;
    }
  }

  console.log(`\nDone: ${done} matched, ${failed} failed/not found`);
}

main();
