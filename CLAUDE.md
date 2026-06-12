# Movie Nights — Project Context

## What this is
A full-stack web app that replaces a Google Sheets spreadsheet used by a group of 5 friends to rate films, track Movie Night sessions, and maintain rankings. Seeded from 834 films originally in the spreadsheet.

## Stack
- **Frontend**: React 18 + Vite, React Router v6, no UI library
- **Backend**: Node.js + Express
- **Database**: SQLite via `better-sqlite3` (WAL mode, foreign keys ON)
- **Containerisation**: Docker + docker-compose with a named volume for DB persistence

## Running

### Production (current default)
```bash
# One-time: build the client
cd client && npm run build
cp -r dist ../server/public

# Start the server
cd server
NODE_ENV=production PORT=3000 DATA_DIR=./data node index.js
```
App is served at `http://localhost:3000`. Express serves the React build as static files and handles all `/api/*` routes.

### Development
```bash
# From the root
npm run dev
# Runs Express on :3001 and Vite dev server on :5173 concurrently
# Vite proxies /api → localhost:3001
```

### Docker
```bash
docker-compose up --build
# App on :3000, SQLite stored in named volume sqlite_data
```

## Project layout
```
MovieNights/
├── client/                   # React + Vite frontend
│   └── src/
│       ├── api.js            # fetch wrapper (getMovies, getRankings, etc.)
│       ├── App.jsx           # Router: / → /films, /rankings, /watchlist
│       ├── index.css         # Global styles, CSS variables, shared classes
│       ├── components/
│       │   ├── MovieCard.jsx / .css     # Film card (grid + list view)
│       │   ├── MovieModal.jsx / .css    # Edit ratings, top3, flags
│       │   ├── AddMovieModal.jsx        # Add new film
│       │   ├── RankingSection.jsx / .css
│       │   └── Header.jsx / .css
│       ├── hooks/
│       │   └── useToast.jsx
│       └── pages/
│           ├── Films.jsx / .css         # Main film browser
│           ├── Rankings.jsx / .css      # 4-row rankings layout
│           └── Watchlist.jsx / .css
├── server/
│   ├── index.js              # Express entry point, seeds DB, mounts routes
│   ├── db.js                 # SQLite setup, schema creation, migrations
│   ├── seed.js               # One-time seeding from data/seed.json
│   ├── data/
│   │   ├── seed.json         # 834 films (has UTF-8 BOM — stripped in seed.js)
│   │   └── movies.db         # SQLite file (gitignored, persisted via volume)
│   └── routes/
│       ├── movies.js         # CRUD + enrichMovie (scores, ratings, comments)
│       └── rankings.js       # 12 ranking panels across 4 row groups
├── Dockerfile                # Multi-stage: Vite build → lean Node runtime
├── docker-compose.yml
└── CLAUDE.md                 # This file
```

## Database schema
```sql
movies  (id, director, title, year, rank_global, mn, watchlist, cinobo, tokens, token_pts)
ratings (id, movie_id → movies, voter TEXT, score REAL, comment TEXT,  UNIQUE(movie_id, voter))
top3    (id, movie_id → movies, voter TEXT, rank INT CHECK IN (1,2,3),  UNIQUE(movie_id, voter))
```
Seeding is idempotent — skips if `COUNT(*) > 0` in movies.

## Voters
```
Μητσέας · Παντελής · Στέλιας · Φώτης · Λεόντιος
GROUP_SIZE = 5
```

## Scoring formulas
| Name | Formula | Used for |
|---|---|---|
| `score` | sum / GROUP_SIZE | internal / legacy |
| `fairScore` | sum / n | pure mean, no token bonus |
| `boostedScore` | score + boost | **Group score** (÷5 + tokens) |
| `fairBoosted` | min(10, fairScore + boost) | **Fair score** (÷voters + tokens) |
| `boost` | Σ rank bonuses | 🥇+1.0, 🥈+0.6, 🥉+0.4 per voter who placed film in Top 3 |

- **Top 3 bonus**: rank-weighted — 🥇 Gold = +1.0, 🥈 Silver = +0.6, 🥉 Bronze = +0.4. Max boost = 5 × 1.0 = +5.0. Both `boostedScore` and `fairBoosted` are capped at 10.
- **Card default ("Fair")**: `fairBoosted` — divides by actual voters, includes Top 3 bonus
- **Card "Group" toggle**: `boostedScore` — divides by GROUP_SIZE=5, includes Top 3 bonus (penalises films not seen by all)
- **Minimum voters for score**: 2+ voters required — solo-rated films show voter pills but no aggregate score

### Tiebreakers (film rankings)
1. More voters wins
2. Higher total token value wins (🥇=1.0 > 🥈=0.6 > 🥉=0.4)
3. Older year wins

## Rankings layout (4 rows × 3 panels)
| Row | Score field | Description |
|---|---|---|
| Fair Score — All Films | `fairBoosted` | ÷voters + tokens, all rated films (≥2 votes) |
| Fair Score — Movie Nights Only | `fairBoosted` | same, `mn = 1` only |
| Group Score — All Films | `boostedScore` | ÷5 + tokens, all rated films |
| Group Score — Movie Nights Only | `boostedScore` | same, `mn = 1` only |

Each row has: Top 10 Films · Top Directors · Top Years

## Key implementation notes
- `/api/movies/directors` route **must** be declared before `/:id` in Express to avoid being caught as an ID lookup
- `seed.js` strips UTF-8 BOM with `.replace(/^﻿/, '')` — PowerShell writes BOM by default
- SQLite empty string literals must use single quotes `''` not double quotes `""` (double quotes = column identifier)
- `db.js` runs `ALTER TABLE ratings ADD COLUMN comment TEXT DEFAULT ''` in a try/catch for safe migration on existing DBs
- `enrichMovie()` in `routes/movies.js` is called on every read and computes all score variants + returns `ratings`, `comments`, `top3` maps
- Production: Express serves `server/public/` (copied from `client/dist`) as static, then a `*` catch-all for React Router

## Color scheme (score thresholds)
- ≥ 7.5 → green (`score-high`)
- ≥ 5.0 → yellow/gold (`score-mid`)
- < 5.0 → red (`score-low`)

MN (Movie Night) badge is **green** throughout the app.
