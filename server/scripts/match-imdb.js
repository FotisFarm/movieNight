// One-time script: match existing films against IMDb title.basics.tsv(.gz)
// Usage: node server/scripts/match-imdb.js <path-to-title.basics.tsv.gz>
const fs = require('fs');
const zlib = require('zlib');
const readline = require('readline');
const db = require('../db');

const TSV_PATH = process.argv[2];
if (!TSV_PATH) {
  console.error('Usage: node server/scripts/match-imdb.js <path-to-title.basics.tsv.gz>');
  process.exit(1);
}

const movies = db.prepare('SELECT id, title, year FROM movies WHERE imdb_id IS NULL').all();
const updateStmt = db.prepare('UPDATE movies SET imdb_id = ? WHERE id = ?');

// key: "lowertitle|year" -> array of movie ids
const lookup = new Map();
for (const m of movies) {
  const key = `${m.title.toLowerCase().trim()}|${m.year}`;
  if (!lookup.has(key)) lookup.set(key, []);
  lookup.get(key).push(m.id);
}

console.log(`Matching ${movies.length} films against IMDb dataset…`);
let matched = 0;

const stream = TSV_PATH.endsWith('.gz')
  ? fs.createReadStream(TSV_PATH).pipe(zlib.createGunzip())
  : fs.createReadStream(TSV_PATH);

const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
let firstLine = true;

rl.on('line', line => {
  if (firstLine) { firstLine = false; return; }
  const parts = line.split('\t');
  const [tconst, titleType, primaryTitle, originalTitle, , startYear] = parts;
  if (titleType !== 'movie') return;

  for (const t of [primaryTitle, originalTitle]) {
    if (!t || t === '\\N') continue;
    const key = `${t.toLowerCase().trim()}|${startYear}`;
    if (lookup.has(key)) {
      for (const id of lookup.get(key)) {
        updateStmt.run(tconst, id);
        matched++;
        console.log(`  ✓ ${t} (${startYear}) → ${tconst}`);
      }
      lookup.delete(key);
    }
  }
});

rl.on('close', () => {
  console.log(`\nDone. Matched ${matched}/${movies.length} films.`);
  const unmatched = movies.filter(m => lookup.has(`${m.title.toLowerCase().trim()}|${m.year}`));
  if (unmatched.length) {
    console.log(`Unmatched (${unmatched.length}):`);
    unmatched.forEach(m => console.log(`  - ${m.title} (${m.year})`));
  }
});
