const db = require('../db');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const KEY = process.env.OMDB_API_KEY;
if (!KEY) { console.error('Set OMDB_API_KEY'); process.exit(1); }

const targets = [
  'Casablanca','Rushmore','Cries and Whispers','Million Dollar Baby',
  'The Pianist','Inherent Vice','Phantom Thread','Kill Bill: Volume 1',
  'Spirited Away','A Fistful of Dollars','A Fistful of Dynamite',
  'For a Few Dollars More','The Good, the Bad and the Ugly','Harakiri',
  'Breathless','Shadows','Bed and Board','Such a Gorgeous Kid Like Me',
  "Don't Come Knocking",'The Wrong Move','The Scarlet Letter',
];

const update = db.prepare('UPDATE movies SET imdb_id = ?, imdb_rating = ? WHERE id = ?');

(async () => {
  for (const title of targets) {
    const m = db.prepare('SELECT id, title, year FROM movies WHERE title = ?').get(title);
    if (!m) { console.log('not found: ' + title); continue; }
    const url = `https://www.omdbapi.com/?t=${encodeURIComponent(m.title)}&y=${encodeURIComponent(m.year)}&apikey=${KEY}`;
    const data = await fetch(url).then(r => r.json());
    if (data.Response === 'True') {
      const rating = data.imdbRating !== 'N/A' ? parseFloat(data.imdbRating) : null;
      update.run(data.imdbID, rating, m.id);
      console.log(`✓ ${m.title} → ${data.imdbID} [${rating ?? 'no rating'}]`);
    } else {
      console.log(`✗ ${m.title} (${m.year}) — ${data.Error}`);
    }
    await sleep(500);
  }
})();
