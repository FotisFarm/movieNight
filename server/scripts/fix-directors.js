require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const db = require('../db');

const API_KEY = process.env.OMDB_API_KEY;
const APPLY   = process.argv.includes('--apply');
const delay   = ms => new Promise(r => setTimeout(r, ms));

if (!API_KEY) { console.error('OMDB_API_KEY not set'); process.exit(1); }

async function fetchOmdb(params) {
  const url = `https://www.omdbapi.com/?apikey=${API_KEY}&${params}`;
  const res  = await fetch(url);
  const data = await res.json();
  return data.Response === 'True' ? data : null;
}

const update = db.prepare('UPDATE movies SET director = ? WHERE id = ?');
let updated = 0, skipped = 0, nodata = 0;

async function handle(film, data) {
  if (!data?.Director || data.Director === 'N/A') {
    console.log(`[NO DATA]  "${film.director}" — no OMDb director (${film.title})`);
    nodata++; return;
  }
  const omdbDir = data.Director.split(',')[0].trim();
  if (!omdbDir.toLowerCase().includes(film.director.toLowerCase())) {
    console.log(`[SKIPPED]  "${film.director}" — OMDb says "${omdbDir}" (${film.title})`);
    skipped++; return;
  }
  console.log(`[${APPLY ? 'UPDATED ' : 'PREVIEW '}] "${film.director}" → "${omdbDir}" (${film.title})`);
  if (APPLY) update.run(omdbDir, film.id);
  updated++;
}

async function run() {
  const withId = db.prepare(`
    SELECT id, title, year, director, imdb_id FROM movies
    WHERE imdb_id IS NOT NULL
      AND director != ''
      AND director NOT LIKE '% %'
  `).all();

  const withoutId = db.prepare(`
    SELECT id, title, year, director FROM movies
    WHERE imdb_id IS NULL
      AND director != ''
      AND director NOT LIKE '% %'
  `).all();

  console.log(`Pass 1: ${withId.length} films with IMDb ID`);
  for (const film of withId) {
    await delay(150);
    await handle(film, await fetchOmdb(`i=${film.imdb_id}`));
  }

  console.log(`\nPass 2: ${withoutId.length} films without IMDb ID`);
  for (const film of withoutId) {
    await delay(150);
    const yearParam = film.year ? `&y=${film.year}` : '';
    await handle(film, await fetchOmdb(`t=${encodeURIComponent(film.title)}${yearParam}`));
  }

  console.log(`\n--- ${APPLY ? 'Applied' : 'Dry run'} ---`);
  console.log(`Would update / updated: ${updated}`);
  console.log(`Skipped (name mismatch): ${skipped}`);
  console.log(`No OMDb data: ${nodata}`);
  if (!APPLY) console.log('\nRun with --apply to write changes to the DB.');
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
