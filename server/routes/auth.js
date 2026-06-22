const express = require('express');
const router = express.Router();

const VOTERS = ['Μητσέας', 'Παντελής', 'Στέλιας', 'Φώτης', 'Λεόντιος'];
const PASSWORD = process.env.MN_PASSWORD || 'changeme';

router.post('/login', (req, res) => {
  const { voter, password } = req.body;
  if (VOTERS.includes(voter) && password === PASSWORD) {
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
