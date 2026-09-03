# Movie Nights 🎬

A private web app for a group of friends to rate films, track Movie Night sessions, and maintain rankings — built to replace a shared Google Sheets spreadsheet.

---

## Features

- **Films** — browse and search the full catalogue, filtered by voter, director, year, or MN status. Rate films, leave comments, assign Top 10 picks, and edit title/director/year inline. Sort by score, controversy, or date added. Live rank badges update as scores change.
- **Rankings** — four leaderboard views (Fair Score / Group Score × All Films / Movie Nights only), each with Top 10 Films, Top Directors, and Top Years panels. Click a director or year to see all their films and their mean score.
- **Watchlist** — films the group wants to watch next, with per-voter voting and a "Most Wanted" ranking.
- **Lists** — free-form named lists ("Christmas 2026", "Noir night") that live alongside the watchlist and touch no film flags. Drag to reorder; anyone can add films, only the creator can rename or delete.
- **Picks** — unrated or partially-rated films ranked by predicted group enjoyment, using a Bayesian blend of director history, decade averages, and Top 10 bonuses. Adjustable bias sliders.
- **Controversy** — films ranked by score standard deviation: green (consensus) → gold → red (polarising).
- **Stats** — per-voter overview (films rated, mean score, favourite director/decade, score distribution) with a drill-down modal, plus everyone's Top 10.
- **Compare** — head-to-head between any two films, or any two voters.
- **Rating history** — every score change and Top 10 movement is recorded. Hover a voter pill on any film card for a stepped graph of how that rating moved over time.
- **Posters and IMDb data** — posters from TMDB, IDs and ratings from OMDb, both resolved automatically when a film is added.
- **Themes** — ten film-inspired colour schemes (The Matrix, Vertigo, Blade Runner, The Godfather, …) selectable from the header and remembered per browser.

---

## Scoring

| Metric | Formula | Used for |
|---|---|---|
| Fair Score | `sum of ratings / number of raters` + Top 10 boost | Default card score |
| Group Score | `sum of ratings / group size (5)` + Top 10 boost | Penalises films not seen by everyone |
| Top 10 boost | `(11 − rank) / 10` per voter — #1 = +1.0, #2 = +0.9 … #10 = +0.1 | Added to both scores, capped at 10 |

Films need at least 2 ratings before an aggregate score is shown.

---

## Stack

- **Frontend**: React 18 + Vite, React Router v6, Radix UI primitives, dnd-kit, Framer Motion
- **Backend**: Node.js + Express
- **Database**: SQLite dialect via `@libsql/client` — [Turso](https://turso.tech) when configured, a local file otherwise
- **Container**: Docker + docker-compose

---

## Running the app

### Prerequisites

Create a `.env` file in the repo root:

```env
# Required
MN_PASSWORD=your_password_here
SESSION_SECRET=a_long_random_string

# Database — omit all three to use a local SQLite file instead of Turso
TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=...
TURSO_READONLY_AUTH_TOKEN=...

# Optional integrations — each degrades gracefully when unset
OMDB_API_KEY=...          # IMDb ids and ratings
TMDB_API_KEY=...          # posters (v3 key or v4 read token)
ANTHROPIC_API_KEY=...     # natural-language Q&A endpoint
GUEST_PASSWORD=...        # read-mostly guest login

# Optional overrides
VOTERS=Name1,Name2,Name3,Name4,Name5
GROUP_SIZE=5
```

Everyone logs in by picking their name and entering the shared `MN_PASSWORD`; `mnAdmin` is an extra account with the same password that can edit anyone's ratings and reset the watchlist.

**Without any `TURSO_*` variables the app runs entirely on a local SQLite file** (`server/data/movies.db`) — no account needed for local development.

---

### Option 1 — Docker

```bash
docker-compose up --build
```

App is available at `http://localhost:3000`. `.env` is read from the repo root and forwarded to the container. To use a different port:

```bash
PORT=8080 docker-compose up --build
```

When Turso is configured, the container is stateless and the `sqlite_data` volume is unused; without it, that volume holds the local-file database.

---

### Option 2 — Production build, run locally

```bash
# Install dependencies
npm install
cd client && npm install && cd ..

# Build the frontend
npm run build
cp -r client/dist server/public

# Start the server
NODE_ENV=production PORT=3000 DATA_DIR=./data node server/index.js
```

App is available at `http://localhost:3000` — Express serves the React build and handles all `/api/*` routes.

---

### Option 3 — Development

```bash
npm install
cd client && npm install && cd ..
npm run dev
```

Runs Express on `:3001` and the Vite dev server on `:5173`. Open `http://localhost:5173`. API requests are proxied automatically.

---

## First-time setup

The database is seeded automatically on first start from `server/data/seed.json`. Seeding is skipped if films already exist, so restarting is always safe. `seed.json` is regenerated nightly from production, so a fresh clone starts with current data rather than the original spreadsheet import.

---

## Environments

| | **Prod** | **Dev** |
|---|---|---|
| Host | Oracle Cloud VM (Milan) | Render (Frankfurt) |
| Branch | `main` | `dev` |
| Database | Turso `movies` | Turso `movies-dev` |
| Deploy | `Deploy to prod` GitHub Action (manual dispatch), or `git pull && docker compose up -d --build` on the box | auto-deploys on push to `dev` |

Work on `dev`, verify on Render, then merge to `main` and deploy. The two databases have separate tokens, so neither environment can reach the other's data.

---

## Backups

`.github/workflows/db-backup.yml` runs daily at 02:00 UTC and reads the production Turso database over the network — no SSH, no dependency on the host. It produces two things:

- **`movies_YYYY-MM-DD.sql`** on the `backups` branch, a rolling 7-day window. Restore with `sqlite3 movies.db < movies_2026-08-12.sql`.
- **a refreshed `server/data/seed.json`** committed to `main`, so a fresh clone seeds current data.

Per-voter comments are deliberately excluded from both artifacts — this repo is public. Ratings, Top 10 picks, watchlist votes, and IMDb data are included.

Turso hosts the live database; these snapshots are the backup. They cover what hosting doesn't: a bad migration or an accidental reset replicates instantly, the `.sql` dumps are plain SQLite and restorable anywhere regardless of the provider or account, and each day's file is a point in time rather than the current state.
