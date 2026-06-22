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
NODE_ENV=production PORT=3000 DATA_DIR=./data node server/index.js
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
│       ├── api.js            # fetch wrapper (getMovies, getRankings, getRecommendations, etc.)
│       ├── App.jsx           # Router: / → /films, /rankings, /watchlist, /recommendations, /controversy, /stats
│       ├── index.css         # Global styles, CSS variables, shared classes
│       ├── components/
│       │   ├── MovieCard.jsx / .css          # Film card (grid + list view)
│       │   ├── MovieModal.jsx / .css         # Edit ratings, top3, flags, title/director/year
│       │   ├── AddMovieModal.jsx             # Add new film
│       │   ├── DirectorYearModal.jsx / .css  # Click director/year in Rankings → films + mean score
│       │   ├── RankingSection.jsx / .css
│       │   └── Header.jsx / .css
│       ├── hooks/
│       │   └── useToast.jsx
│       └── pages/
│           ├── Films.jsx / .css         # Main film browser
│           ├── Rankings.jsx / .css      # 4-row rankings layout
│           ├── Watchlist.jsx / .css
│           ├── Recommendations.jsx / .css  # "Picks" page — ranked unrated/partially-rated films
│           ├── Controversy.jsx / .css   # Films ranked by score std deviation
│           └── Stats.jsx / .css         # Per-voter overview + head-to-head comparison
├── server/
│   ├── index.js              # Express entry point, seeds DB, mounts routes
│   ├── db.js                 # SQLite setup, schema creation, migrations
│   ├── seed.js               # One-time seeding from data/seed.json
│   ├── omdb.js               # OMDb API helper (lookupImdb) — used by scripts only
│   ├── data/
│   │   ├── seed.json         # 834 films (has UTF-8 BOM — stripped in seed.js); directors stored as full names
│   │   └── movies.db         # SQLite file (gitignored, persisted via volume)
│   ├── routes/
│   │   ├── movies.js         # CRUD + enrichMovie (scores, ratings, comments)
│   │   ├── rankings.js       # 12 ranking panels across 4 row groups
│   │   └── recommendations.js  # GET /api/recommendations — Bayesian ranked picks
│   └── scripts/              # One-off DB maintenance scripts (IMDb enrichment etc.)
├── .github/
│   └── workflows/
│       └── db-backup.yml     # Daily DB snapshot → backups branch (02:00 UTC, 7-day rolling window)
├── Dockerfile                # Multi-stage: Vite build → lean Node runtime
├── docker-compose.yml
└── CLAUDE.md                 # This file
```

## Database schema
```sql
movies  (id, director, title, year, rank_global, mn, watchlist, cinobo, tokens, token_pts,
         imdb_id TEXT, imdb_rating REAL)
ratings (id, movie_id → movies, voter TEXT, score REAL, comment TEXT,  UNIQUE(movie_id, voter))
top3    (id, movie_id → movies, voter TEXT, rank INT CHECK IN (1,2,3),  UNIQUE(movie_id, voter))
watchlist_votes (id, movie_id → movies, voter TEXT,  UNIQUE(movie_id, voter))
```
Seeding is idempotent — skips if `COUNT(*) > 0` in movies.
`imdb_id` / `imdb_rating` columns exist in DB but are not exposed in the UI (IMDb feature paused).

## Auth
Per-voter session auth. Login page shows the 5 voter names as buttons; all share the same password (`MN_PASSWORD` from `.env`).
`req.session.voter` stores the logged-in voter name. `GET /api/auth/me` returns `{ voter }`.
`.env` lives at repo root; `server/index.js` loads it with `require('dotenv').config({ path: '../.env' })`.
Session secret also comes from `.env` (`SESSION_SECRET`). All `/api/*` routes except `/api/auth` require auth (`req.session.voter` must be set).

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

### Films page sort options
| Value | Label | Notes |
|---|---|---|
| `alpha` | A → Z | Default |
| `alpha-dir` | By Director | Secondary sort: title |
| `year-desc` | Newest | By release year |
| `year-asc` | Oldest | By release year |
| `score-desc` | Fair Score ↓ | ≥2 voters only; switches scoreMode to fair |
| `score-asc` | Fair Score ↑ | ≥2 voters only; switches scoreMode to fair |
| `group-desc` | Group Score ↓ | ≥2 voters only; switches scoreMode to group |
| `group-asc` | Group Score ↑ | ≥2 voters only; switches scoreMode to group |
| `added-desc` | Recently Added | Sort by `id DESC` (auto-increment = insertion order) |
| `added-asc` | First Added | Sort by `id ASC` |
| `controversial` | Most Controversial | ≥2 voters only; sorts by `stdDev DESC` |

Score sorts filter out films with <2 voters before sorting (`scoreSortActive` flag). Search is always client-side (JS `.toLowerCase()` handles Greek); all other filters (mn, rated, voter, director, year) are server-side.

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

Clicking a **director** or **year** row opens `DirectorYearModal` — shows all matching films as MovieCards (list view, sorted by the clicked panel's `scoreKey` desc) plus the mean score (same `scoreKey`) of films with ≥2 votes. The `scoreKey` and `mnOnly` flag travel from ROWS config → `RankingSection` prop → click callback → `selectedLabel` state → `DirectorYearModal` prop. Clicking a film card within opens the standard `MovieModal`.

## Recommendations ("Picks") — `/api/recommendations`
Surfaces films with ≤2 votes, ranked by predicted group enjoyment using a Bayesian blend:

```
confidence     = voterCount / GROUP_SIZE
prior          = dirAvg * dw + decAvg * ew + top3Bonus * tw   (weights user-adjustable via sliders)
predictedScore = confidence * actualFairBoosted + (1 - confidence) * prior
```

- Default weights: `dw=0.45, ew=0.45, tw=0.10` — director and decade weighted equally
- Weights are normalised server-side so they always sum to 1
- `dirAvg`: mean `fairBoosted` of all rated films by the same director
- `decAvg`: mean `fairBoosted` of all rated films from the same decade
- `top3Bonus`: min(2.0, number of top3 entries across all voters for that director)
- When only one signal is available, the missing weight is split between the remaining two
- Films with 0 votes use 100% prior; films with 2 votes use 40% actual + 60% prior
- Returns up to 200 results; client-side filters trim the visible list
- Frontend filters (MN, WL, voter, director, year, search, unvoted-by) applied client-side
- Bias sliders + max-voters send `?dw=&ew=&tw=&maxVoters=` to the API (debounced 400ms)

### Picks page controls
| Control | Type | Where | Effect |
|---|---|---|---|
| Director / Era / Top3 bias | Sliders | Bias bar | Re-weight prior formula, triggers refetch |
| Max voters | Select (0–4) | Bias bar | Sets server-side candidacy threshold (`voterCount <= maxVoters`); default 2 |
| Unvoted by | Voter pill toggles | Bias bar | Client-side: hides films a selected voter has already rated (intersection when multiple active) |
| MN / WL / Voter / Director / Year / Search | Filters bar | Top | Client-side display filters |

**Server caveat**: `maxVoters=0` requires explicit undefined-check (`req.query.maxVoters !== undefined`) because `parseInt('0') || 2` would incorrectly default to 2.

## Key implementation notes
- `/api/movies/directors` route **must** be declared before `/:id` in Express to avoid being caught as an ID lookup
- `seed.js` strips UTF-8 BOM with `.replace(/^﻿/, '')` — PowerShell writes BOM by default
- Directors in `seed.json` and the DB are stored as full names (e.g. "Stanley Kubrick", not "Kubrick"). `server/scripts/fix-directors.js` was used to enrich single-word entries via OMDb; keep seed.json in sync if adding new films.
- SQLite empty string literals must use single quotes `''` not double quotes `""` (double quotes = column identifier)
- `db.js` runs `ALTER TABLE` migrations in try/catch for safe schema evolution on existing DBs
- `enrichMovie()` in `routes/movies.js` is called on every read and computes all score variants + returns `ratings`, `comments`, `top3` maps. `boost` is computed unconditionally (outside the `n > 0` block) so it's always available for client-side tiebreaking
- Production: Express serves `server/public/` (copied from `client/dist`) as static, then a `*` catch-all for React Router
- `MovieModal` has an inline edit mode (✎ button) for title, director, and year — PATCH payload always includes these fields
- **Live rank badges** (Films page): `allMovies` state (always full, unfiltered) feeds a `rankMap` memo that computes fair/group/mnFair/mnGroup rank positions using the same tiebreaker order as `rankings.js`. MovieCard receives `rank_global` and `mn_rank` from this map, not from the DB column. MN badge shows `MN #N` where N is the MN-specific rank matching the active score mode.
- **Rankings refetch on navigate**: `Rankings.jsx` uses `useLocation().key` as a `useEffect` dependency — React Router changes `.key` on every navigation, so rankings always reload when switching to the Rankings tab.
- **`stdDev`**: computed in `enrichMovie()` as `sqrt(Σ(score - mean)² / n)`, rounded to 2dp. `null` when `n < 2`. Used by Controversy page and "Most Controversial" sort. Color thresholds: `<1` → green (consensus), `1–2` → gold, `≥2` → red (polarising).
- **Controversy page** (`/controversy`): fetches all rated films client-side, filters to `voterCount ≥ 2 && stdDev != null`, sorts by `stdDev DESC`. Per-voter score pills colored by individual score.
- **Stats page** (`/stats`): fetches all 834 films once, computes everything client-side via `useMemo`. Per-voter cards show rated count, mean score, top3 count, fav director/decade, score distribution bar chart. Head-to-head section compares two voters across shared films sorted by absolute score difference.
- **Watchlist voting**: `watchlist_votes` table tracks per-voter votes. `enrichMovie()` adds `watchlistVotes: string[]` to every movie. `POST /api/movies/:id/watchlist-vote` toggles the session voter's vote (insert or delete). Watchlist page shows a "Most Wanted" ranking panel (films with ≥1 vote, sorted by vote count desc, tiebreak: voterCount desc) above the card grid. Vote button on each card reflects the logged-in voter's vote status. The `voter` prop is passed from `App.jsx` (sourced from session via `api.me()`).
- **`/api/movies/:id/watchlist-vote`** must be declared before `/:id` in Express (same rule as `/directors`).

## DB backup (production)
App runs in Docker on remote server. DB is in named volume `movienight_sqlite_data`.

### Automated GitHub Actions backup
`.github/workflows/db-backup.yml` runs daily at 02:00 UTC (also triggerable manually via Actions UI):
- SSHes into the server, pulls the DB from the Docker volume
- Commits it as `movies_YYYY-MM-DD.db` to the `backups` branch
- Deletes snapshots older than 7 days — rolling 7-day window always available on GitHub

Required GitHub secrets: `SSH_HOST`, `SSH_USER`, `SSH_PRIVATE_KEY`.

### Restore from backup
```bash
# Download a specific snapshot locally
git fetch origin backups
git checkout origin/backups -- movies_2026-06-16.db

# Restore into the Docker volume (run on server)
scp movies_2026-06-16.db user@server:/tmp/
ssh user@server "docker run --rm -v movienight_sqlite_data:/data -v /tmp:/src alpine cp /src/movies_2026-06-16.db /data/movies.db"
```

### Manual pull
```bash
ssh user@server "docker run --rm -v movienight_sqlite_data:/data alpine cat /data/movies.db" > movies_local.db
```

## Deploy (production)
`.github/workflows/deploy.yml` triggers automatically on every push to `main`:
- SSHes into the server, runs `git pull` in `~/movieNight`
- Runs `docker compose down` then `docker compose up --build -d`

Reuses the same GitHub secrets: `SSH_HOST`, `SSH_USER`, `SSH_PRIVATE_KEY`. No additional setup needed.

**Note**: the server uses Docker Compose V2 (`docker compose`, plugin-based). The legacy `docker-compose` v1 is also installed but has a `ContainerConfig` bug with newer Docker Engine — always use `docker compose` (no hyphen) in scripts.

## Color scheme (score thresholds)
- ≥ 7.5 → green (`score-high`)
- ≥ 5.0 → yellow/gold (`score-mid`)
- < 5.0 → red (`score-low`)

MN (Movie Night) badge is **green** throughout the app.
