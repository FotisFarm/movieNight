const path = require('path');
const fs = require('fs');
const db = require('../db');
const { fetchLetterboxdRating } = require('../letterboxd');

const DATA_FILE = path.join(__dirname, '..', 'data', 'initial-letterboxd.json');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  await db.init();

  let data = {};
  if (fs.existsSync(DATA_FILE)) {
    try {
      data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      console.log(`Loaded existing ${Object.keys(data).length} Letterboxd ratings from ${DATA_FILE}`);
    } catch (e) {
      console.warn('Could not parse existing file, starting fresh:', e.message);
    }
  }

  const movies = await db.all("SELECT id, title, imdb_id FROM movies WHERE imdb_id IS NOT NULL AND imdb_id != ''");
  const missing = movies.filter(m => data[m.id] === undefined);

  console.log(`Total catalog films with IMDb: ${movies.length}`);
  console.log(`Already resolved: ${Object.keys(data).length}`);
  console.log(`Pending lookup: ${missing.length}`);

  const BATCH_SIZE = 5;
  let fetched = 0;

  for (let i = 0; i < missing.length; i += BATCH_SIZE) {
    const chunk = missing.slice(i, i + BATCH_SIZE);
    await Promise.all(chunk.map(async (m) => {
      try {
        const score = await fetchLetterboxdRating(m.imdb_id);
        data[m.id] = score; // null if not found
        fetched++;
        console.log(`[${fetched}/${missing.length}] ${m.title} (${m.imdb_id}) -> ${score ?? 'null'}`);
      } catch (err) {
        console.warn(`Error on ${m.title}: ${err.message}`);
        data[m.id] = null;
      }
    }));

    // Save every batch so progress is never lost
    fs.writeFileSync(DATA_FILE, JSON.stringify(data));
    await sleep(250);
  }

  console.log('Finished backfill! Total saved:', Object.keys(data).length);

  // Now update database
  const entries = Object.entries(data).filter(([_, s]) => s != null);
  console.log(`Updating database for ${entries.length} rated movies...`);
  const CHUNK = 100;
  for (let i = 0; i < entries.length; i += CHUNK) {
    const slice = entries.slice(i, i + CHUNK);
    const whenClauses = slice.map(([id, s]) => `WHEN ${parseInt(id, 10)} THEN ${Number(s)}`).join(' ');
    const ids = slice.map(([id]) => parseInt(id, 10)).join(',');
    const sql = `UPDATE movies SET letterboxd_rating = CASE id ${whenClauses} END WHERE id IN (${ids})`;
    await db.run(sql);
  }
  console.log('Database updated successfully!');
}

run().catch(console.error);
