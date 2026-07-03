const express = require('express');
const router = express.Router();

const { VOTERS } = require('../config');
const VALID_USERS = [...VOTERS, 'mnAdmin'];
const PASSWORD = process.env.MN_PASSWORD || 'changeme';
const GHOST_VOTER = 'Σάκιας';
const GHOST_PASSWORD = process.env.GUEST_PASSWORD || '';

router.post('/login', (req, res) => {
  const { voter, password } = req.body;
  if (voter === GHOST_VOTER && GHOST_PASSWORD && password === GHOST_PASSWORD) {
    req.session.voter = voter;
    return res.json({ ok: true, voter });
  }
  if (VALID_USERS.includes(voter) && password === PASSWORD) {
    req.session.voter = voter;
    return res.json({ ok: true, voter });
  }
  res.status(401).json({ error: 'Invalid credentials' });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/me', (req, res) => {
  res.json({ voter: req.session.voter || null });
});

module.exports = router;
