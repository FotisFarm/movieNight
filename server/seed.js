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

function seed() {
  const count = db.prepare('SELECT COUNT(*) as n FROM movies').get().n;
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

  const insertMovie = db.prepare(`
    INSERT INTO movies (director, title, year, rank_global, mn, watchlist, tokens, token_pts)
    VALUES (@director, @title, @year, @rank_global, @mn, @watchlist, @tokens, @token_pts)
  `);
  const insertRating = db.prepare(`
    INSERT OR IGNORE INTO ratings (movie_id, voter, score) VALUES (?, ?, ?)
  `);
  const insertTop3 = db.prepare(`
    INSERT OR IGNORE INTO top3 (movie_id, voter, rank) VALUES (?, ?, ?)
  `);

  const seedAll = db.transaction(() => {
    for (const row of rows) {
      const rank = parseInt(row.rank) || null;
      const { lastInsertRowid: movieId } = insertMovie.run({
        director: row.director || '',
        title: row.movie || '',
        year: row.year || '',
        rank_global: rank,
        mn: row.mn === 'Y' ? 1 : 0,
        watchlist: row.watchlist === 'Y' ? 1 : 0,
        tokens: row.tokens || '',
        token_pts: parseInt(row.tokenPts) || 0,
      });

      for (const voter of VOTERS) {
        const score = parseRating(row.ratings?.[voter]);
        if (score !== null) insertRating.run(movieId, voter, score);

        const top3rank = row.top3?.[voter];
        if (top3rank && ['1', '2', '3'].includes(String(top3rank))) {
          insertTop3.run(movieId, voter, parseInt(top3rank));
        }
      }
    }
  });

  seedAll();
  console.log(`Seeded ${rows.length} movies.`);
}

module.exports = { seed };
