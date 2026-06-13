const express = require('express');
const router = express.Router();

const USERNAME = 'mnAdmin';
const PASSWORD = process.env.MN_PASSWORD || 'changeme';

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (username === USERNAME && password === PASSWORD) {
    req.session.user = USERNAME;
    return res.json({ ok: true });
  }
  res.status(401).json({ error: 'Invalid credentials' });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/me', (req, res) => {
  res.json({ user: req.session.user || null });
});

module.exports = router;
