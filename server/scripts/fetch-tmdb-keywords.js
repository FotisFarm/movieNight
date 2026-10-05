// Fetches TMDB keywords and genres for all films in seed.json or local database,
// and saves them to server/initial-keywords.json for fast bundling and deployment.
//
// Usage:
//   node server/scripts/fetch-tmdb-keywords.js

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const fs = require('fs');
const path = require('path');
const tmdb = require('../tmdb');

const OUTPUT_FILE = path.join(__dirname, '..', 'initial-keywords.json');

async function main() {
  console.log('\n🎬 Fetching TMDB keywords & genres for all films...\n');

  // Load existing cache if any
  let cache = {};
  if (fs.existsSync(OUTPUT_FILE)) {
    try {
      cache = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
      console.log(`📂 Loaded existing cache with ${Object.keys(cache).length} films.`);
    } catch (_) {}
  }

  // Load movie list from local DB if available, else seed.json
  let movies = [];
  try {
    const { createClient } = require('@libsql/client');
    const dbPath = path.join(__dirname, '..', 'data', 'movies.db');
    if (fs.existsSync(dbPath)) {
      const client = createClient({ url: `file:${dbPath}` });
      const rs = await client.execute('SELECT id, title, director, year, imdb_id FROM movies ORDER BY id ASC');
      movies = rs.rows;
      client.close();
      console.log(`📊 Found ${movies.length} movies in local database.`);
    }
  } catch (err) {
    console.warn('Note: reading movies from seed.json fallback...');
  }

  if (!movies.length) {
    const seedPath = path.join(__dirname, '..', 'data', 'seed.json');
    const raw = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
    movies = (Array.isArray(raw) ? raw : []).map((m, idx) => ({
      id: idx + 1,
      title: m.movie,
      director: m.director,
      year: m.year,
      imdb_id: m.imdb_id,
    }));
    console.log(`📊 Found ${movies.length} movies in seed.json.`);
  }

  const missing = movies.filter(m => !cache[m.id] || !Array.isArray(cache[m.id]) || cache[m.id].length === 0);
  console.log(`🔍 Need to fetch keywords for ${missing.length} / ${movies.length} films.`);

  if (missing.length === 0) {
    console.log('✅ All films already have keywords cached!');
    return;
  }

  let completed = 0;
  let failed = 0;
  const BATCH_SIZE = 6;

  for (let i = 0; i < missing.length; i += BATCH_SIZE) {
    const chunk = missing.slice(i, i + BATCH_SIZE);
    await Promise.all(chunk.map(async (m) => {
      try {
        let tmdbId = null;
        if (m.imdb_id) {
          const byId = await tmdb.findByImdbId(m.imdb_id);
          if (byId?.tmdbId) tmdbId = byId.tmdbId;
        }
        if (!tmdbId && m.title) {
          const [first] = await tmdb.searchMovie(m.title, m.year);
          if (first?.tmdbId) tmdbId = first.tmdbId;
        }

        if (!tmdbId) {
          cache[m.id] = [];
          failed++;
          return;
        }

        // Fetch keywords and details concurrently
        const [kwData, detailData] = await Promise.all([
          tmdb.tmdbFetch(`/movie/${tmdbId}/keywords`),
          tmdb.tmdbFetch(`/movie/${tmdbId}`),
        ]);

        const keywords = (kwData?.keywords || []).map(k => String(k.name || '').toLowerCase().trim());
        const genres = (detailData?.genres || []).map(g => String(g.name || '').toLowerCase().trim());

        // Deduplicate and filter out trivial strings
        const combined = [...new Set([...genres, ...keywords])].filter(s => s && s.length > 1);
        cache[m.id] = combined;
        completed++;
      } catch (err) {
        cache[m.id] = [];
        failed++;
      }
    }));

    // Periodically save progress every 50 films
    if ((i + BATCH_SIZE) % 48 === 0 || i + BATCH_SIZE >= missing.length) {
      fs.writeFileSync(OUTPUT_FILE, JSON.stringify(cache, null, 2), 'utf8');
      const pct = Math.round(((i + chunk.length) / missing.length) * 100);
      process.stdout.write(`\r⏳ Progress: ${i + chunk.length}/${missing.length} (${pct}%) — ${completed} fetched, ${failed} without keywords.`);
    }

    // Small polite throttle (100ms)
    await new Promise(r => setTimeout(r, 100));
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(cache, null, 2), 'utf8');
  console.log(`\n\n🎉 Done! Saved keywords for ${Object.keys(cache).length} films to ${OUTPUT_FILE}`);
}

main().catch(console.error);
