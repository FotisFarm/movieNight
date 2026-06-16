# Movie Nights 🎬

A private web app for a group of friends to rate films, track Movie Night sessions, and maintain rankings — built to replace a shared Google Sheets spreadsheet.

---

## Features

- **Films** — browse and search the full film catalogue with filtering by voter, director, year, and MN status. Rate films, leave comments, and assign Top 3 picks. Sort by score, controversy, or date added.
- **Rankings** — four leaderboard views (Fair Score / Group Score × All Films / Movie Nights only), each with Top 10 Films, Top Directors, and Top Years panels. Click a director or year to see all their films and their mean score.
- **Watchlist** — keep track of films the group wants to watch next.
- **Picks** — recommendations for unrated or partially-rated films, ranked by predicted group enjoyment using a Bayesian blend of director history, decade averages, and Top 3 bonuses. Adjustable bias sliders.
- **Controversy** — films ranked by score standard deviation, highlighting the most divisive picks in green (consensus) → gold → red (polarising).
- **Stats** — per-voter overview (films rated, mean score, favourite director/decade, score distribution) plus a head-to-head comparison between any two voters.

---

## Scoring

| Metric | Formula | Used for |
|---|---|---|
| Fair Score | `sum of ratings / number of raters` | Default card score |
| Group Score | `sum of ratings / 5` | Penalises films not seen by everyone |
| Top 3 boost | 🥇 +1.0 · 🥈 +0.6 · 🥉 +0.4 per voter | Added to both scores, capped at 10 |

Films need at least 2 ratings before an aggregate score is shown.

---

## Stack

- **Frontend**: React 18 + Vite, React Router v6
- **Backend**: Node.js + Express
- **Database**: SQLite via `better-sqlite3`
- **Container**: Docker + docker-compose

---

## Running the app

### Prerequisites

Create a `.env` file in the repo root:

```env
MN_PASSWORD=your_password_here
SESSION_SECRET=a_long_random_string
```

`MN_PASSWORD` is the login password for the single `mnAdmin` account. `SESSION_SECRET` can be any long random string.

---

### Option 1 — Docker (recommended)

```bash
docker-compose up --build
```

App is available at `http://localhost:3000`. The database is persisted in a named Docker volume and survives container restarts. To use a different port:

```bash
PORT=8080 docker-compose up --build
```

---

### Option 2 — Production (manual)

```bash
# Install dependencies
npm install
cd client && npm install && cd ..

# Build the frontend
cd client && npm run build && cd ..
cp -r client/dist server/public

# Start the server
NODE_ENV=production PORT=3000 DATA_DIR=./data node server/index.js
```

App is available at `http://localhost:3000`.

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

The database is seeded automatically on first start from `server/data/seed.json`. Seeding is skipped on subsequent starts if data already exists — safe to restart at any time.

---

## Backups

A GitHub Actions workflow runs daily at 02:00 UTC, pulling the live database from the server and committing it to the `backups` branch. A rolling 7-day window of snapshots is maintained and can be restored via a separate one-click restore workflow.
