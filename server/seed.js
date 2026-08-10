const db = require('./db');
const path = require('path');
const fs = require('fs');

const VOTERS = ['Μητσέας', 'Παντελής', 'Στέλιας', 'Φώτης', 'Λεόντιος'];

function parseRating(s) {
  if (!s || typeof s !== 'string') return null;
  s = s.replace(/\*/g, '').trim();
  const m = s.match(/^([\d]+[,.]?[\d]*)\s*(?:\/10)?$/);
  if (!m) return null;
  const v = parseFloat(m[1].replace(',', '.'));
  return isNaN(v) ? null : Math.min(10, Math.max(0, v));
}

async function seed() {
  const { n: count } = await db.get('SELECT COUNT(*) as n FROM movies');
  if (count > 0) {
    console.log(`DB already seeded (${count} movies). Skipping.`);
    return;
  }

  const seedFile = path.join(__dirname, 'data', 'seed.json');
  if (!fs.existsSync(seedFile)) {
    console.warn('No seed.json found, starting empty.');
    return;
  }

  const raw = fs.readFileSync(seedFile, 'utf8').replace(/^﻿/, '');
  const rows = JSON.parse(raw);

  await db.transaction(async (tx) => {
    for (const row of rows) {
      const rank = parseInt(row.rank) || null;
      const { lastInsertRowid: movieId } = await tx.run(
        `INSERT INTO movies (director, title, year, rank_global, mn, watchlist, tokens, token_pts)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        row.director || '',
        row.movie || '',
        row.year || '',
        rank,
        row.mn === 'Y' ? 1 : 0,
        row.watchlist === 'Y' ? 1 : 0,
        row.tokens || '',
        parseInt(row.tokenPts) || 0,
      );

      for (const voter of VOTERS) {
        const score = parseRating(row.ratings?.[voter]);
        if (score !== null) {
          await tx.run('INSERT OR IGNORE INTO ratings (movie_id, voter, score) VALUES (?, ?, ?)', movieId, voter, score);
        }

        const top3rank = parseInt(row.top3?.[voter]);
        if (top3rank >= 1 && top3rank <= 10) {
          await tx.run('INSERT OR IGNORE INTO top3 (movie_id, voter, rank) VALUES (?, ?, ?)', movieId, voter, top3rank);
        }
      }
    }
  });

  console.log(`Seeded ${rows.length} movies.`);
}

module.exports = { seed };
