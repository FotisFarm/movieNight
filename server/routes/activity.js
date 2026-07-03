const express = require('express');
const db = require('../db');

const router = express.Router();

// GET /api/activity?limit=40&voter=
router.get('/', (req, res) => {
  /** Return recent events, optionally filtered by voter, newest first. */
  const limit = Math.min(100, parseInt(req.query.limit) || 40);
  const voter = req.query.voter || null;

  let query = `
    SELECT e.id, e.movie_id, e.voter, e.action, e.detail, e.ts,
           m.title, m.director, m.year
    FROM events e
    LEFT JOIN movies m ON m.id = e.movie_id
  `;
  const params = [];
  if (voter) { query += ' WHERE e.voter = ?'; params.push(voter); }
  query += ' ORDER BY e.ts DESC LIMIT ?';
  params.push(limit);

  res.json(db.prepare(query).all(...params));
});

module.exports = router;
