require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const db = require('./db');
const { seed } = require('./seed');

const app = express();
const PORT = process.env.PORT || 3001;
const IS_PROD = process.env.NODE_ENV === 'production';

const { SESSION_COOKIE_NAME } = require('./config');

app.use(express.json());
app.use(cors({ origin: IS_PROD ? false : 'http://localhost:5173', credentials: true }));
const TursoSessionStore = require('./sessionStore');
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

app.use(session({
  name: SESSION_COOKIE_NAME,
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  store: new TursoSessionStore({ ttl: THIRTY_DAYS }),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: false,
    maxAge: THIRTY_DAYS,
    sameSite: 'lax',
  },
}));

const { attachGroupContext, getAllVoters } = require('./groupContext');

app.use(attachGroupContext);

app.use('/api/auth', require('./routes/auth'));

app.get('/api/config', async (req, res) => {
  const { SANDBOX_MODE, SANDBOX_VOTER, HIDE_HAL } = require('./config');
  const isLoggedIn = Boolean(req.session.voter || req.session.userId);
  if (!isLoggedIn) {
    return res.json({
      voters: [],
      groupSize: 5,
      minVoters: 2,
      activeGroup: null,
      allVoters: [],
      sandboxMode: SANDBOX_MODE,
      sandboxVoter: SANDBOX_VOTER,
      hideHal: HIDE_HAL,
      isAdmin: false,
      isSiteAdmin: false,
      isGroupAdmin: false,
    });
  }
  const group = req.group;
  const isSiteAdmin = Boolean(req.session?.isAdmin || req.session?.voter === 'mnAdmin' || req.session?.username === 'mnAdmin');
  const isGroupAdmin = Boolean(group?.members?.some(m => (m.id === req.session?.userId || m.displayName === req.session?.voter || m.username === req.session?.voter) && m.role === 'admin'));
  const isAdmin = isSiteAdmin || isGroupAdmin;
  res.json({
    voters: group.voters,
    groupSize: group.groupSize,
    minVoters: group.minVoters,
    activeGroup: { id: group.id, name: group.name, slug: group.slug, members: group.members },
    allVoters: group.voters,
    sandboxMode: SANDBOX_MODE,
    sandboxVoter: SANDBOX_VOTER,
    hideHal: HIDE_HAL,
    isAdmin,
    isSiteAdmin,
    isGroupAdmin,
    currentUser: req.session.voter || req.session.displayName,
  });
});

function requireAuth(req, res, next) {
  if (req.session.voter || req.session.userId) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

function requireAdmin(req, res, next) {
  const isAdmin = Boolean(req.session?.isAdmin || req.session?.voter === 'mnAdmin');
  if (isAdmin) return next();
  res.status(403).json({ error: 'Forbidden: Administrator privileges required' });
}

app.use('/api/admin', requireAuth, requireAdmin, require('./routes/admin'));
app.use('/api/movies', requireAuth, require('./routes/movies'));
app.use('/api/rankings', requireAuth, require('./routes/rankings'));
app.use('/api/recommendations', requireAuth, require('./routes/recommendations'));
app.use('/api/session', requireAuth, require('./routes/session'));
app.use('/api/lists', requireAuth, require('./routes/lists'));
app.use('/api/chat', requireAuth, require('./routes/chat'));

if (IS_PROD) {
  const clientDist = path.join(__dirname, 'public');
  app.use(express.static(clientDist));
  app.get('*', (_req, res) =>
    res.sendFile(path.join(clientDist, 'index.html'))
  );
}

// Express 4 does not catch rejected promises from async route handlers on
// its own — every async route is wrapped with server/asyncHandler.js so
// errors land here as a normal 500 instead of crashing the process. This is
// the final backstop for anything that still slips through.
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

// Last-resort safety net: log and keep running rather than let Node's
// default fatal-crash behavior for an unhandled rejection take the whole
// server down over one bad request.
process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});

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
