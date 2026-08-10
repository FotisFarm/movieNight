require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const db = require('./db');
const { seed } = require('./seed');

const app = express();
const PORT = process.env.PORT || 3001;
const IS_PROD = process.env.NODE_ENV === 'production';

app.use(express.json());
app.use(cors({ origin: IS_PROD ? false : 'http://localhost:5173', credentials: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, secure: false, maxAge: 7 * 24 * 60 * 60 * 1000 },
}));

app.use('/api/auth', require('./routes/auth'));

app.get('/api/config', (_req, res) => {
  const { VOTERS, GROUP_SIZE, MIN_VOTERS } = require('./config');
  res.json({ voters: VOTERS, groupSize: GROUP_SIZE, minVoters: MIN_VOTERS });
});

function requireAuth(req, res, next) {
  if (req.session.voter) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

app.use('/api/movies', requireAuth, require('./routes/movies'));
app.use('/api/rankings', requireAuth, require('./routes/rankings'));
app.use('/api/recommendations', requireAuth, require('./routes/recommendations'));
app.use('/api/chat', requireAuth, require('./routes/chat'));

if (IS_PROD) {
  const clientDist = path.join(__dirname, 'public');
  app.use(express.static(clientDist));
  app.get('*', (_req, res) =>
    res.sendFile(path.join(clientDist, 'index.html'))
  );
}

// DB schema/migrations and seeding are both async (libSQL is a network
// client) — must finish before the server starts accepting requests.
(async () => {
  await db.init();
  await seed();
  app.listen(PORT, () =>
    console.log(`Movie Nights running on http://localhost:${PORT}`)
  );
})().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
