# Movie Nights — Project Context

## What this is
A full-stack web app that replaces a Google Sheets spreadsheet used by a group of 5 friends to rate films, track Movie Night sessions, and maintain rankings. Seeded from 834 films originally in the spreadsheet.

## Stack
- **Frontend**: React 18 + Vite, React Router v6. No general UI framework, but Radix primitives (`react-dialog`, `react-select`, `react-tooltip`), `dnd-kit` (list reordering) and `framer-motion` are in use
- **Backend**: Node.js + Express
- **Database**: SQLite dialect via `@libsql/client` (Turso in production, a local file in dev — see [Database / persistence](#database--persistence-turso))
- **Containerisation**: Docker (single `Dockerfile`, client build + server runtime); `docker-compose.yml` runs the Oracle prod box and local use
- **Hosting**: see [Environments](#environments-prod--dev) — **prod** is an Oracle Cloud VM (Milan), **dev** is Render (Frankfurt). Both are stateless; all data lives in Turso.

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
│       ├── App.jsx           # Router: /films, /rankings, /watchlist, /lists, /recommendations, /controversy, /stats, /compare, /chat
│       ├── constants.js      # VOTERS fallback for components that render before /api/config lands
│       ├── utils.js          # fmt, scoreClass, posterUrl, extractImdbId (client-side convenience copy)
│       ├── AppConfigContext.jsx  # Fetches GET /api/config → { voters, groupSize, minVoters } — see [Configurable voters](#configurable-voters--group-size)
│       ├── ThemeContext.jsx  # Theme state + localStorage persistence — see [Themes](#themes)
│       ├── index.css         # Global styles, CSS variables, shared classes, all theme palettes
│       ├── components/
│       │   ├── MovieCard.jsx / .css          # Film card (grid + list view)
│       │   ├── MovieModal.jsx / .css         # Edit ratings, top10, flags, title/director/year
│       │   ├── AddMovieModal.jsx             # Add new film
│       │   ├── DirectorYearModal.jsx / .css  # Click director/year in Rankings → films + mean score
│       │   ├── RatingHistory.jsx / .css      # Voter-pill hover popover + StepChart — see [Rating history](#rating-history)
│       │   ├── RankIcon.jsx                  # Top 10 rank badge (🥇🥈🥉 for 1–3, number badge for 4–10)
│       │   ├── RankingSection.jsx / .css
│       │   └── Header.jsx / .css             # Nav + theme dropdown + mobile footer
│       ├── hooks/
│       │   ├── useToast.jsx
│       │   └── useRankMap.js # Live fair/group/mnFair/mnGroup rank positions from the full film list
│       ├── stories/          # MovieCard + RankingSection Storybook stories — ⚠️ no storybook dep or script; orphaned
│       └── pages/
│           ├── Login.jsx                # Voter-name buttons + shared password
│           ├── Films.jsx / .css         # Main film browser
│           ├── Rankings.jsx / .css      # 4-row rankings layout
│           ├── Watchlist.jsx / .css
│           ├── Recommendations.jsx / .css  # "Picks" page — ranked unrated/partially-rated films
│           ├── Controversy.jsx / .css   # Films ranked by score std deviation
│           ├── Stats.jsx / .css         # Per-voter overview + drill-down + everyone's Top 10
│           ├── Compare.jsx / .css       # Two modes: film-vs-film and voter-vs-voter head-to-head
│           ├── Lists.jsx / .css         # Custom named film lists (index + detail)
│           └── Chat.jsx / .css          # Natural-language Q&A over the DB (read-only)
├── server/
│   ├── index.js              # Express entry point, seeds DB, mounts routes, serves GET /api/config
│   ├── config.js             # VOTERS / GROUP_SIZE / MIN_VOTERS, env-overridable
│   ├── scoring.js            # rankBonus(rank) = (11 − rank) / 10 — the single definition
│   ├── asyncHandler.js       # Wraps async route handlers so rejections reach the error middleware
│   ├── db.js                 # libSQL client (Turso/local file), async get/all/run/transaction helpers, schema+migrations
│   ├── enrich.js             # enrichMovie / enrichMoviesBatch — shared by the movies and lists routes
│   ├── seed.js               # One-time seeding from data/seed.json
│   ├── omdb.js               # OMDb helpers: lookupImdb, searchImdb (fuzzy), getImdbById, extractImdbId
│   ├── tmdb.js               # TMDB helpers: poster lookup by imdb_id (see [Posters](#posters-tmdb))
│   ├── db-readonly.js        # Second libSQL client (ideally a read-only Turso token) + runReadOnlySql
│   ├── llm.js                # Anthropic text-to-SQL tool runner (claude-sonnet-5)
│   ├── data/
│   │   ├── seed.json         # Regenerated nightly from production — see [DB backup](#db-backup--seed-refresh)
│   │   └── movies.db         # local-file DB fallback (gitignored) — only used when TURSO_DATABASE_URL is unset
│   ├── routes/
│   │   ├── auth.js           # /api/auth — login/logout/me; VOTERS + mnAdmin + the Σάκιας guest
│   │   ├── movies.js         # CRUD (scores/ratings/comments come from enrich.js)
│   │   ├── rankings.js       # 12 ranking panels across 4 row groups
│   │   ├── recommendations.js  # GET /api/recommendations — Bayesian ranked picks
│   │   ├── lists.js          # /api/lists — custom named film lists
│   │   └── chat.js           # POST /api/chat — natural-language Q&A (read-only)
│   └── scripts/
│       ├── backup-and-seed.js  # Nightly SQL dump + seed.json regeneration (async API, current)
│       ├── backfill-posters.js # Fills movies.poster_path from TMDB (re-runnable)
│       ├── backfill-rating-history.js  # Reconstructs history from the backups branch — see [Backfill](#backfill--serverscriptsbackfill-rating-historyjs)
│       ├── fix-imdb-ids.js     # Repairs imdb_ids pointing at making-ofs/trailers
│       ├── poster-census.js    # Poster coverage report (OMDb vs TMDB), no DB needed
│       └── ...                 # Older one-off IMDb enrichment scripts (still on the dead sync API — see below)
├── .github/
│   └── workflows/
│       ├── db-backup.yml     # Daily 02:00 UTC: SQL snapshot → backups branch + seed.json refresh → main
│       └── deploy.yml        # Manual dispatch: SSH deploy to the Oracle prod box — see [Environments](#environments-prod--dev)
├── Dockerfile                # Multi-stage: Vite build → lean Node runtime
├── docker-compose.yml
├── PICKS.md                  # Full walkthrough of the recommendations formula
├── README.md                 # Public-facing overview
└── CLAUDE.md                 # This file
```

## Database schema
```sql
movies  (id, director, title, year, rank_global, mn, watchlist, cinobo, tokens, token_pts,
         imdb_id TEXT, imdb_rating REAL, poster_path TEXT)
ratings (id, movie_id → movies, voter TEXT, score REAL, comment TEXT,  UNIQUE(movie_id, voter))
top3    (id, movie_id → movies, voter TEXT, rank INT CHECK(rank>=1 AND rank<=10),  UNIQUE(movie_id, voter))  -- legacy name; now Top 10
watchlist_votes (id, movie_id → movies, voter TEXT,  UNIQUE(movie_id, voter))
rating_history  (id, movie_id → movies, voter TEXT, kind TEXT, score REAL, rank INT,
                 changed_by TEXT, source TEXT, changed_at TEXT)  -- append-only, see [Rating history](#rating-history)
lists      (id, title TEXT, description TEXT, created_by TEXT, created_at TEXT DEFAULT datetime('now'),
            slug TEXT UNIQUE)                                    -- URL slug, see [Custom lists](#custom-lists--lists)
list_items (id, list_id → lists, movie_id → movies, position INT,  UNIQUE(list_id, movie_id))
list_slug_aliases (slug TEXT PRIMARY KEY, list_id → lists)       -- slugs a list used to answer to, after a rename
```
Seeding is idempotent — skips if `COUNT(*) > 0` in movies. `seed.json` is regenerated nightly from production, so a fresh clone seeds a local DB with **current** data, not the original 834-film spreadsheet import — see [DB backup & seed refresh](#db-backup--seed-refresh).
`imdb_id` / `imdb_rating` are populated from OMDb on add and shown in the UI — see [IMDb integration](#imdb-integration).
`poster_path` is a **TMDB** path (`/abc.jpg`), not a URL — see [Posters (TMDB)](#posters-tmdb).
`watchlist_votes` rows are deleted when a film leaves the watchlist (and cascade on film delete).

## Database / persistence (Turso)
Migrated from `better-sqlite3` (local file + Docker volume) to **Turso** (`@libsql/client`, same SQLite dialect) on 2026-08-10, because Render's Free/Starter tiers have no persistent disk — the container filesystem resets on every restart, not just deploys. Turso is a remote, network-hosted SQLite-compatible DB, so writes actually survive restarts.
- **`server/db.js`**: creates a libSQL client pointed at `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` when set, else falls back to a local file (`DATA_DIR/movies.db`) — local dev needs no Turso account. Exports async `get`/`all`/`run`/`transaction` helpers that mirror the old `db.prepare(sql).get/all/run()` shape (`db.prepare(sql).get(...params)` → `await db.get(sql, ...params)`), plus `init()` (schema + migrations), which `server/index.js` awaits before `app.listen()`.
- **Every route handler and DB call is now async** — libSQL is a network client, there is no synchronous path. `db.transaction(async tx => { ... })` replaces the old `db.transaction(fn)()` pattern; `tx` exposes the same get/all/run shape.
- **`movie_scores` is now a permanent `VIEW`** (created in `db.js`'s `init()`, dropped and recreated on every boot so a changed `GROUP_SIZE` isn't baked in stale), not a `TEMP VIEW` on the read-only connection — a remote libSQL connection isn't guaranteed to reuse the same session between separate `.execute()` calls, so a session-scoped TEMP VIEW isn't safe there.
- **`rank_bonus` is inlined SQL arithmetic** (`(11 - rank) / 10.0`) instead of a registered JS callback (`db.function('rank_bonus', rankBonus)`) — a remote engine can't invoke a callback into the Node process per row.
- **`server/db-readonly.js`** (chatbot) uses a second libSQL client, ideally authenticated with a Turso database-scoped **read-only token** (`TURSO_READONLY_AUTH_TOKEN`, minted via `turso db tokens create --read-only`) for an engine-enforced read-only guarantee — falls back to the main `TURSO_AUTH_TOKEN` if unset, in which case `runReadOnlySql`'s `SELECT`/`WITH`-prefix guard is the only defense.
- **`server/scripts/*.js`** — the older one-off IMDb enrichment / maintenance scripts still call the old `db.prepare(...)` API and were **not** updated in this migration; they'll throw `db.prepare is not a function` until rewritten to the async `get`/`all`/`run` helpers. The exception is **`backup-and-seed.js`**, which was written against the current API and works.
- **Setup required** (not done from here — needs an actual Turso account): create a database, get its `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` (+ optional read-only token), set them as Render env vars, and import the current DB content — Turso's CLI supports creating a database directly from an existing SQLite file (verify exact current syntax against Turso's docs, e.g. something like `turso db create <name> --from-file <path>`). Once real rows exist, `seed.js`'s idempotent skip (`COUNT(*) > 0`) prevents the 834-film seed from ever overwriting them.

## Auth
Per-voter session auth. Login page shows the voter names as buttons; all share the same password (`MN_PASSWORD` from `.env`).
`req.session.voter` stores the logged-in voter name. `GET /api/auth/me` returns `{ voter }`.
Valid users are `VOTERS` **plus `mnAdmin`** (same password — can edit anyone's rating and reset the watchlist) and a separate guest account **`Σάκιας`**, which authenticates against `GUEST_PASSWORD` instead and is disabled when that variable is unset (see `server/routes/auth.js`).
`.env` lives at repo root; `server/index.js` loads it with `require('dotenv').config({ path: '../.env' })`.
Session secret also comes from `.env` (`SESSION_SECRET`). All `/api/*` routes except `/api/auth` and `/api/config` require auth (`req.session.voter` must be set).

## Voters
```
Μητσέας · Παντελής · Στέλιας · Φώτης · Λεόντιος
GROUP_SIZE = 5
```

### Configurable voters & group size
Neither list is hardcoded any more. **`server/config.js`** reads `VOTERS` (comma-separated) and `GROUP_SIZE` from the environment, falling back to the five names above and 5, and derives `MIN_VOTERS = min(2, GROUP_SIZE)`. Everything server-side imports from there.

The client learns them at runtime: **`GET /api/config`** (declared in `server/index.js` *before* the `requireAuth` mounts, so the login page can read it) returns `{ voters, groupSize, minVoters }`, and **`AppConfigContext.jsx`** fetches it once at boot and exposes `useAppConfig()`. Components use that, not a constant — `client/src/constants.js` holds only a hardcoded `VOTERS` fallback for the first render before the fetch lands.

Practical consequence: **don't hardcode voter names or `5` in new code** — read `useAppConfig()` on the client and `require('./config')` on the server. This is what lets the single-voter "Σάκιας" deployment work off the same codebase.

## Themes
Ten film-inspired colour schemes, selectable from a dropdown in `Header.jsx` (and the mobile footer). `THEMES` there is the list; the palettes live in `client/src/index.css` as `[data-theme="..."]` blocks overriding the CSS variables.

- **`ThemeContext.jsx`** holds the state, persists it to `localStorage` under `mn-theme`, and writes `document.documentElement.dataset.theme`. The default, `'original'`, sets the attribute to `''` so bare `:root` applies.
- Ids: `matrix`, `vertigo`, `clockwork`, `taxi-driver`, `blade-runner`, `amelie`, `godfather`, `grand-budapest`, `itmfl`, plus `original`.
- `index.css` also contains `cold-press`, `signal` and `blanc` blocks that are **not** in the dropdown — earlier drafts, still styled but unreachable.
- Themes go well beyond variable swaps: several override component-level selectors (`[data-theme="cold-press"] .modal-header`, …), so **a new shared component may need per-theme rules** rather than inheriting cleanly.
## Scoring formulas
| Name | Formula | Used for |
|---|---|---|
| `score` | sum / GROUP_SIZE | internal / legacy |
| `fairScore` | sum / n | pure mean, no token bonus |
| `boostedScore` | score + boost | **Group score** (÷5 + tokens) |
| `fairBoosted` | min(10, fairScore + boost) | **Fair score** (÷voters + tokens) |
| `boost` | Σ rank bonuses | `rankBonus(r) = (11 − r)/10` per voter who placed film in their Top 10 |

- **Top 10 bonus**: linear rank-weighted — `rankBonus(rank) = (11 − rank) / 10`, i.e. #1 = +1.0, #2 = +0.9 … #10 = +0.1. Defined once in `server/scoring.js` (and mirrored in `MovieModal.jsx` for the live preview). Max boost = 5 × 1.0 = +5.0. Both `boostedScore` and `fairBoosted` are capped at 10. Icons: 🥇🥈🥉 for ranks 1–3, a number badge (`RankIcon`) for 4–10.
- **Top 10 overflow**: `PATCH /api/movies/:id` giving a voter a new pick while they already have 10 auto-evicts their lowest-priority *other* pick (the film just touched always survives) rather than erroring — handled in the per-voter renumber step in `routes/movies.js`.
- **Card default ("Fair")**: `fairBoosted` — divides by actual voters, includes Top 10 bonus
- **Card "Group" toggle**: `boostedScore` — divides by GROUP_SIZE=5, includes Top 10 bonus (penalises films not seen by all)
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
2. Higher total token value wins (rankBonus: #1=1.0 > #2=0.9 > … > #10=0.1)
3. Older year wins

## Rankings layout (1 of 4 rows × 4 panels)
| Row | Score field | Description |
|---|---|---|
| Fair Score — All Films | `fairBoosted` | ÷voters + tokens, all rated films (≥2 votes) |
| Fair Score — Movie Nights Only | `fairBoosted` | same, `mn = 1` only |
| Group Score — All Films | `boostedScore` | ÷5 + tokens, all rated films |
| Group Score — Movie Nights Only | `boostedScore` | same, `mn = 1` only |

Each row has: Top 10 Films · Top Directors · Top Years · Top Decades

**Two selectors pick which row is on screen** — *Score* (Fair / Group) and *Films* (Movie Nights / All), defaulting to **Fair · Movie Nights**. `GET /api/rankings` returns every panel for all four combinations in one response, so switching is instant and never refetches. Both choices persist per browser in `localStorage` (`mn_rankScore`, `mn_rankScope`), alongside the existing `mn_rankPanels` (which panel types are shown) and `mn_minDirFilms`.

Clicking a **director** or **year** row opens `DirectorYearModal` — shows all matching films as MovieCards (list view, sorted by the clicked panel's `scoreKey` desc) plus the mean score (same `scoreKey`) of films with ≥2 votes. The `scoreKey` and `mnOnly` flag travel from ROWS config → `RankingSection` prop → click callback → `selectedLabel` state → `DirectorYearModal` prop. Clicking a film card within opens the standard `MovieModal`.

## Recommendations ("Picks") — `/api/recommendations`
Surfaces films with ≤2 votes, ranked by predicted group enjoyment using a Bayesian blend.
**Full walkthrough with worked examples: [`PICKS.md`](PICKS.md).**

```
confidence     = voterCount / GROUP_SIZE
prior          = dirAvg * dw + decAvg * ew + top10Bonus * tw   (weights user-adjustable via sliders)
predictedScore = confidence * actualFairBoosted + (1 - confidence) * prior
```

- Default weights: `dw=0.45, ew=0.45, tw=0.10` — director and decade weighted equally
- Weights are normalised server-side so they always sum to 1
- `dirAvg`: mean `fairBoosted` of all rated films by the same director
- `decAvg`: mean `fairBoosted` of all rated films from the same decade
- `top10Bonus`: min(5.0, Σ `rankBonus(rank)` of all top-pick entries for that director, across voters) — rank-weighted so a #1 pick counts more than a #10
- When only one signal is available, the missing weight is split between the remaining two
- Films with 0 votes use 100% prior; films with 2 votes use 40% actual + 60% prior
- Returns up to 200 results; client-side filters trim the visible list
- Frontend filters (MN, WL, voter, director, year, search, unvoted-by) applied client-side
- Bias sliders + max-voters send `?dw=&ew=&tw=&maxVoters=` to the API (debounced 400ms)

### Picks page controls
| Control | Type | Where | Effect |
|---|---|---|---|
| Director / Era / Top10 bias | Sliders | Bias bar | Re-weight prior formula, triggers refetch |
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
- **Live rank badges** (Films page): `allMovies` state (always full, unfiltered) feeds **`hooks/useRankMap.js`**, which computes fair/group/mnFair/mnGroup rank positions using the same tiebreaker order as `rankings.js` (and `minVoters` from `useAppConfig()`). MovieCard receives `rank_global` and `mn_rank` from that map, not from the DB column. MN badge shows `MN #N` where N is the MN-specific rank matching the active score mode.
- **Rankings refetch on navigate**: `Rankings.jsx` uses `useLocation().key` as a `useEffect` dependency — React Router changes `.key` on every navigation, so rankings always reload when switching to the Rankings tab.
- **List-view `MovieCard` wraps instead of truncating**: the row is a wrapping flex line (`flex-wrap: wrap`) and `.card-info` has `flex: 1 1 220px` (150px under 640px), so when the badges + voter pills can't fit beside the title they drop to a second row and the title gets two full lines (`-webkit-line-clamp: 2`) rather than an ellipsis. This matters most with 5 voters in a narrow container — the Stats-page film-list modal, `DirectorYearModal`, the Picks list.
- **`stdDev`**: computed in `enrichMovie()` as `sqrt(Σ(score - mean)² / n)`, rounded to 2dp. `null` when `n < 2`. Used by Controversy page and "Most Controversial" sort. Color thresholds: `<1` → green (consensus), `1–2` → gold, `≥2` → red (polarising).
- **Controversy page** (`/controversy`): fetches all rated films client-side, filters to `voterCount ≥ 2 && stdDev != null`, sorts by `stdDev DESC`. Per-voter score pills colored by individual score.
- **Stats page** (`/stats`): fetches all 834 films once, computes everything client-side via `useMemo`. Per-voter cards show rated count, mean score, top-10 pick count, fav director/decade, score distribution bar chart; clicking a card opens a drill-down modal (top/bottom films, director/decade breakdown). An "Everyone's Top 10" section lists each voter's ranked picks. (Voter head-to-head moved to the `/compare` page.)
  - **Highlight tiles and the score cap**: `fairBoosted` is capped at 10 and ~14 of the ~200 scored films sit exactly on that cap, so it can't order the top on its own. "Highest rated" breaks ties by voter count first (same rule as everywhere else), then by the **uncapped** `fairScore + boost`, then oldest year. "Lowest rated" is sorted independently rather than read off the end of that list — reversing a descending sort reverses its tiebreaks too, which used to award "worst" to the *least*-voted film; voter count still points the same way, only score and year flip.
- **Compare page** (`/compare`): two modes behind a Movies/Voters toggle. *Movies* — pick two films with an inline substring picker and see every voter's two scores side by side, plus a win/draw/loss tally over voters who rated both. *Voters* — the head-to-head that used to live on Stats. Voter lists come from `useAppConfig()`, so it degrades to the single-voter deployment.
- **Watchlist voting**: `watchlist_votes` table tracks per-voter votes. `enrichMovie()` adds `watchlistVotes: string[]` to every movie. `POST /api/movies/:id/watchlist-vote` toggles the session voter's vote (insert or delete). Watchlist page shows a "Most Wanted" ranking panel (films with ≥1 vote, sorted by vote count desc, tiebreak: voterCount desc) above the card grid. Vote button on each card reflects the logged-in voter's vote status. The `voter` prop is passed from `App.jsx` (sourced from session via `api.me()`).
- **`/api/movies/:id/watchlist-vote`** must be declared before `/:id` in Express (same rule as `/directors`).
- **Removing a film from the watchlist wipes its votes** — handled server-side in `PATCH /:id` (when `watchlist` goes truthy → falsy), so it covers every path: the Remove button, "Mark as MN", and the `MovieModal` watchlist toggle. Re-adding a film starts with zero votes. Deleting a film cascades its votes via the FK.
- **`POST /api/movies/watchlist/reset`** — **admin only** (`req.session.voter === 'mnAdmin'`, else 403), declared before `/:id`, runs in a transaction. Body `{ mode }`:
  - `'votes'` — deletes all `watchlist_votes`; films stay on the watchlist
  - `'all'` — also sets `watchlist = 0` on every flagged film (films are **never** deleted)

  Returns `{ votesCleared, filmsCleared }`. Any other `mode` → 400. UI: "Reset Watchlist" button in the `Watchlist.jsx` header (admin only) opens a confirm modal offering both options. The per-card **Remove** button uses an inline confirm that names the vote count it will clear. Reset also clears the `wl-tied-order` localStorage manual tie-break ordering, which would otherwise be stale.

## IMDb integration
`OMDB_API_KEY` (from root `.env`) drives all OMDb calls. It **must be passed into the container** — `docker-compose.yml` forwards it to both services. Unset key → every helper degrades to `null`/`[]` and the app works without IMDb data.

### `server/omdb.js`
| Function | OMDb param | Returns |
|---|---|---|
| `lookupImdb(title, year)` | `?t=` | `{ imdbId, imdbRating }` — single best guess |
| `searchImdb(query, year)` | `?s=` | up to 8 ranked candidates `{ imdbId, title, year, poster }` |
| `getImdbById(id)` | `?i=` | `{ imdbId, title, year, director, imdbRating }` |
| `extractImdbId(input)` | — | pulls `tt\d{6,}` out of a URL/fragment/bare id, else `''` |

**OMDb's `?s=` matches whole words only — no prefix, no fuzziness.** A typo inside a word (`Parasitte`, `Inceptoin`) returns *zero* results, so client-side ranking alone cannot help. `searchImdb` therefore uses three tiers:
1. `title + year`
2. `title` alone (a typo + strict year is doubly restrictive)
3. **token-drop**: search each word (≥4 chars, no stop-words, longest first) on its own — one correctly-spelled word finds the film (`"Shawshank Redemtion"` → `Shawshank`)

Tier 3 also fires when tiers 1–2 return only *weak* matches (best score > `WIDEN_ABOVE = 0.15`), because OMDb happily returns a documentary short for the real film (`Inglorious Basterds`).

All candidates are then scored by **length-normalised Levenshtein distance to the typed title + a year-proximity penalty** (lower = better), sorted, and anything above `MAX_SCORE = 0.40` is dropped as noise (keeps `zzqwx nonsense` returning "no match" instead of *Nonsense (1936)*).

**Known limit**: single-word typos are unrecoverable — `The Godfater` → nothing; `Parasit` confidently returns the real-but-different *Parasit (2015)*. The mismatch warning and paste-a-link fallback are the backstop.

### Routes (all before `/:id`)
- `GET /api/movies/imdb-search?title=&year=` → `{ status: 'exact', match }` | `{ status: 'candidates', candidates }` | `{ status: 'none' }`. Exactness = normalised title equality **and** year equality.
- `GET /api/movies/imdb-detail?imdbId=` → full detail, or 404. Accepts a full URL (runs `extractImdbId`).
- `POST /api/movies` accepts an optional `imdb_id`; if present it enriches by id (authoritative — the user picked it), else falls back to `lookupImdb(title, year)`. Best-effort: a failed lookup never blocks the add.
- `PATCH /api/movies/:id` — sending `imdb_id` re-fetches the rating and writes both columns; sending `''`/garbage clears both. Omitting `imdb_id` leaves IMDb data untouched (no needless re-fetch on ordinary saves). The raw string is always run through `extractImdbId`, so a pasted URL never reaches the DB.

### UI
- **`AddMovieModal`**: on Add, resolves the title against OMDb first. Exact → creates directly. No exact match → candidate pick-list (posters) + a **paste IMDb link/ID** field + "add anyway". Picking autofills title/year/director from OMDb. A bad id shows an error and attaches nothing.
- **`MovieModal`**: the **IMDb tile is always rendered** (a `＋` when unset). Clicking the yellow badge opens imdb.com (`stopPropagation`); clicking anywhere else on the tile toggles the IMDb editor, which sits directly under the info-grid. The editor has an id field (accepts a pasted link), a **Search** button (candidate list), a clear ✕, and a **"View on IMDb ↗"** link.
- **Mismatch warning**: when the entered id's canonical title/year differ from the film's, a gold banner shows *"IMDb says X — your entry is Y"* plus a **Use IMDb's values** button. It **warns, never blocks** — Greek/alternate titles legitimately differ. Comparison ignores case/whitespace.
- `extractImdbId` is duplicated in `client/src/utils.js` (client-side convenience) and `server/omdb.js` (the authority — the API never trusts the client).

## Rating history
Every score change and Top 10 movement is recorded in `rating_history` (append-only, never updated). Surfaced on the **voter pills of every `MovieCard`**: hover — or tap on mobile — floats a small stepped graph, clicking opens a detail window with the full 0–10 axis. Visible to everyone, like the scores themselves.

- **Stepped, never interpolated.** A rating is a value that *holds* until someone changes it, so a straight line from 7.0 to 6.0 would draw a 6.5 in mid-July that nobody ever gave. `StepChart` in `client/src/components/RatingHistory.jsx` draws flat runs and vertical transitions; the flat stretch is the information.
- **`kind`** is `'score'` (carries `score`; NULL = the rating was cleared) or `'top10'` (carries `rank`; NULL = the film left that voter's Top 10).
- **`changed_by` is the session voter, not `voter`** — `mnAdmin` can edit anyone's rating and the trail says who actually did it.
- **Writes are diffed first.** `MovieModal` PATCHes the whole ratings map on every save, so `routes/movies.js` compares against the stored values before appending — otherwise editing a film's title would log a no-op row per voter. The read + upsert + append run in one `db.transaction`.
- **Top 10 logging covers knock-on movement.** A single pick renumbers or evicts *other* films (see the overflow rule), so the PATCH handler snapshots each affected voter's whole Top 10 before the change and records every film whose position moved, not just the one edited.
- **Deliberately NOT in `enrichMovie`.** That runs over all ~1,090 films on Films, Stats and Picks; `rating_history` is the only table here that grows without bound. `GET /api/movies/:id/history` returns one film's rows grouped by voter, fetched on first hover (180ms hover intent) and cached for the session in `RatingHistory.jsx`.
- **The popover is portalled to `<body>`** with fixed positioning and edge flipping — inside the card it would be clipped by the grid's overflow. It carries its own hover handlers so the pointer can travel from pill to popover without it closing, and every pill interaction calls `stopPropagation` (the card's own click opens `MovieModal`).
- **Backups**: `rating_history` is in the `.sql` snapshot but deliberately **not** in `seed.json` — that file is committed daily and engineered to produce no diff on an unchanged day, which an append-only table would break permanently.

### Backfill — `server/scripts/backfill-rating-history.js`
`ratings` has never had a timestamp, so the history before this feature was reconstructed from the daily snapshots on the `backups` branch: the 7-day pruning window only removes files from the branch *tip*, so every historical commit still holds that day's dump. Diffing consecutive days recovers when each score actually moved. `--dry-run` (default), `--apply`, `--force`, `--limit=N`, `--branch=`.

Verified against ground truth: *Dead Poets Society* 7 → 6, *The Return of the King* 9 → 9.5, *Alexander* 3.5 → 4.5, all on 2026-08-25.

What the archive can and can't give:
- **Floor is 2026-06-23.** The first week of snapshots (06-16 → 06-22) are 4 KB files holding nothing but a SQLite header — the workflow ran before there was a database to dump. They're skipped, not read as an empty state.
- **Granularity is uneven.** The `.sql` era (2026-08-12 →) is genuinely daily. The pre-Turso `.db` era has only 5 distinct snapshots (06-23, 06-26, 06-29, 07-03, then nothing until the migration), so ~6 weeks of changes land stamped on 2026-08-12.
- **Attribution is unknowable** — the dumps record values, not who typed them. Every reconstructed row gets `source='backfill'` and an empty `changed_by`.
- ⚠️ **Only valid against a database whose ids ARE the snapshot ids** — production, or a restore from one of these dumps. A DB seeded from `seed.json` has its ids reassigned by AUTOINCREMENT, and the history would silently attach to the wrong films. The script verifies alignment by title against the newest snapshot and refuses below 90%.

## Custom lists — `/lists`
Free-form, named film lists ("Christmas 2026", "Noir night", …) that live alongside the watchlist and don't touch any film flag.

- **Tables**: `lists` + `list_items` + `list_slug_aliases` (see [Database schema](#database-schema)). Deleting a list cascades its items and aliases; deleting a film cascades out of every list. Films themselves are **never** deleted by a list operation.
- **Routes** (`server/routes/lists.js`, all behind `requireAuth`). `:key` is a slug, an alias, or a numeric id — see [Slugs](#list-urls--slugs):
  | Route | Does |
  |---|---|
  | `GET /api/lists` | every list + `film_count`, up to 6 `posters`, newest first. `?movieId=` also sets `has_film` per list |
  | `GET /api/lists/:key` | the list + `films[]`, fully enriched, in `position` order |
  | `POST /api/lists` | create (`created_by` = session voter; title required, ≤80 chars; slug derived from the title) |
  | `PATCH /api/lists/:key` | rename / re-describe — **creator or `mnAdmin` only**, else 403. A title change re-slugs and parks the old slug |
  | `DELETE /api/lists/:key` | delete — same 403 rule |
  | `POST /api/lists/:key/items` | append `{ movie_id }`; `INSERT OR IGNORE`, so re-adding is a no-op |
  | `DELETE /api/lists/:key/items/:movieId` | remove one entry |
  | `PUT /api/lists/:key/items` | `{ order: [movieId…] }` — rewrites `position` in a transaction |

### List URLs & slugs
Lists are addressed by slug (`/lists/christougenna-2026`), not by id.
- **`server/slugify.js`** turns a title into a slug: Greek is **transliterated to Latin** (a Greek slug percent-encodes into noise the moment someone pastes the link into a chat app), Latin accents are stripped, and a purely numeric result is prefixed (`list-2026`) so slugs and legacy numeric ids can never collide.
- **`server/listSlugs.js`'s `uniqueSlug`** resolves collisions with a numeric suffix (`noir-night`, `noir-night-2`), checking both current slugs and parked aliases. It takes the db helpers as an argument so `db.js` can call it during `init()` without a require cycle.
- **A rename re-slugs the list** so the URL keeps matching the name on screen, and the outgoing slug is parked in `list_slug_aliases` — a link already shared in the group chat still resolves and the client swaps the address bar for the canonical slug (`navigate(..., { replace: true })`). Bare numeric ids resolve too, for links predating slugs.
- **`db.js` backfills** a slug for every list that has none, so lists created before the migration keep working. The column is added nullable (SQLite can't `ALTER TABLE ADD COLUMN … UNIQUE`) with a separate unique index.
- Writes from the client address the list by **numeric id**, which never changes.
- **Permissions are deliberately split**: *anyone* logged in can add/remove films from *any* list (it's a 5-friend group, lists are collaborative), but only the creator (or `mnAdmin`) can rename or delete one, so nobody wipes someone else's list by accident.
- **`enrichMovie`/`enrichMoviesBatch` moved to `server/enrich.js`** so this route can return the same movie shape as `/api/movies` without importing the movies router. `routes/movies.js` now imports them from there.
- **UI**: `/lists` is the index (cards, "+ New list"), `/lists/:key` the detail — both rendered by `pages/Lists.jsx` off the same route component. The detail view has a debounced search-and-add box (hits `GET /api/movies?search=`), `MovieCard listView` rows, per-row ✕ remove, and dnd-kit drag reorder (optimistic, reverts on error) for the creator/admin.
- **Index cards stack posters**: `PosterStack` in `Lists.jsx` renders the `posters` the API returns as a 2:3 strip above the title, plus `+N` for the remainder. Up to three sit side by side; past that they overlap (`.lists-card-posters.overlap`, `-18px` margin) so a long list stays inside the card instead of scaling the artwork down.
- **Films can be added from anywhere**, not just this page: `MovieModal` has a **Lists** section (toggle chip per list, `has_film` = on the list, plus a "+ New list" field that creates and adds in one step). Membership is written straight through to the item endpoints rather than batched into the modal's Save, so it commits on click — which is why `ListDetail` refetches when the modal closes.

## Posters (TMDB)
Film posters come from **TMDB**, not OMDb. `TMDB_API_KEY` (root `.env`, forwarded in `docker-compose.yml`) accepts either a v3 API key or a v4 read token — `server/tmdb.js` tells them apart by shape (a v4 token is a JWT and goes in the `Authorization` header). Unset key → every helper returns `null` and the app works without posters, same pattern as `OMDB_API_KEY`.

**Why TMDB and not OMDb's `Poster` field** (OMDb already returns one, for free, on calls we make anyway):
- OMDb hands back whatever Amazon size string it has — measured across three films: `_QL75_UY562_CR..` (24 KB), `_QL75_UX380_CR..` (45 KB), `_SX300` (13 KB). Same UI slot, 3.5× spread, no way to ask for a width. Rewriting the directive (`._V1_SX150.jpg`) does work, but it's undocumented Amazon URL munging.
- TMDB serves documented, stable widths off its own CDN. Measured for one poster: `w92` 3 KB, `w154` 6 KB, `w185` 7 KB, `w342` 25 KB, `w500` 33 KB, `original` 119 KB.
- OMDb's free tier is **1,000 requests/day**, so a one-shot backfill of ~888 films spends the day's quota and silently breaks `lookupImdb`/`searchImdb` meanwhile. TMDB has no daily cap.

**Design**: store only `poster_path` (`/3bhkrj58Vtu7enYsRolD1fZdja1.jpg`); the width is chosen at render time by `posterUrl(path, size)` in `client/src/utils.js`. Moving providers later means changing one column, not the UI.

- **`server/tmdb.js`** — `findByImdbId` (the main path: TMDB indexes by `imdb_id`, so it's an exact lookup with no fuzzy matching to get wrong), `searchMovie`, `getExternalIds`, `lookupPosterPath`.
- **Kept separate from OMDb on purpose**: OMDb still owns *identity* (`imdb_id`, `imdb_rating`, the tuned fuzzy title matching in `omdb.js`); TMDB only ever answers "what poster goes with this film?".
- **Write points**: `POST /api/movies` resolves a poster after the IMDb enrichment (own try/catch — a TMDB outage can't cost the IMDb data just written); `PATCH /api/movies/:id` re-points `poster_path` whenever `imdb_id` changes, and **clears it on a TMDB miss** rather than leaving the previous film's artwork.
- **UI**: `MovieCard` renders a fixed 2:3 box (`w92` in list view, `w185` in grid) with `loading="lazy"` — the aspect box means row heights are settled before any image arrives, so nothing reflows as they stream in. Films with no poster keep the footprint and show a `🎞` placeholder. `MovieModal` shows `w185` in its header.
- **Attribution**: TMDB's terms require it ("This product uses the TMDB API but is not endorsed or certified by TMDB") — **not yet added to the UI**.

### Backfilling
`server/scripts/backfill-posters.js` fills `poster_path` for every film with an `imdb_id` and no poster. Re-runnable and safe (TMDB has no cap); `--dry-run`, `--force`, `--limit=N`. Talks to whatever DB `server/db.js` points at, so it needs the usual Turso env in production.

### ⚠️ Wrong `imdb_id`s — `server/scripts/fix-imdb-ids.js`
The poster work surfaced a pre-existing data bug: **~20 films had an `imdb_id` pointing at the wrong IMDb entry** — a making-of, a trailer, a Q&A, a podcast episode. `tt2709758` was "The Making of 'Schindler's List'", `tt1013648` "The Making of 'Good Will Hunting'", `tt5235758` "Bande-annonce de 'Week End'". Those films showed the **wrong IMDb rating** and could not resolve a poster. Cause: `omdb.js`'s `searchImdb` matches whole words only and happily returns a companion piece for the real film (the documented limitation).

Detection uses TMDB, which indexes by `imdb_id`: an id resolving to a film whose title/year don't match ours — or to nothing — is suspect. The replacement is found by searching TMDB for our own title + year and reading back that film's IMDb id.

Two safety rules, both learned the hard way from the first dry run:
1. **Auto-apply only when the stored id resolves to *nothing* on TMDB.** If it resolves to a real film, a "wrong" title may just be an alternate one (*Se7en*, *Nouvelle Vague*, *Warriors of the Wind*), so it's left for a human.
2. **Containment title matching needs a 0.6 length ratio.** Bare containment matched "Seven" inside "Seven Sundays" and would have overwritten *Se7en*'s perfectly good id with a different film.

Nothing is written without `--apply`. 12 films were repaired this way (`imdb_id`, `imdb_rating` and `poster_path` all rewritten); the rest print for manual fixing through the `MovieModal` IMDb editor.

## Chatbot — "HAL 9000" (natural-language Q&A)
`/chat` page lets any logged-in voter ask free-form questions about the data ("which director do we rate highest?", "what should I watch from the watchlist?"). **Read-only** — it can query the DB but never mutate it. The chatbot is branded as **HAL 9000**.

⚠️ **HAL has no UI entry point.** The red HAL-eye SVG (`HalLink` in `Header.jsx`, left of the theme selector and in the mobile footer) was **removed on 2026-08-31 by request** — HAL is not surfaced anywhere in the app. The `/chat` route, `pages/Chat.jsx`, `POST /api/chat` and `server/llm.js` are all still wired and working, so the page is reachable by typing the URL and restoring it means putting a link back in `Header.jsx` (the eye's SVG markup and its `.hal-link`/`.hal-eye` CSS were deleted — see git history for `Header.jsx`/`Header.css` before that commit).

- **Model**: `claude-sonnet-5` via the Anthropic SDK **tool runner** (`server/llm.js`), persona = HAL 9000. Thinking is disabled to keep chat responses snappy.
- **Cards**: when an answer lists films/directors/years/decades, HAL appends a fenced ` ```cards ` block holding a JSON array (`{ type, id?, value?, title, meta, score, scoreLabel }`). `Chat.jsx` parses that block out of the reply (`parseReply`) and renders a **column of cards** styled like the Stats-page highlight tiles (`hal-card*` classes). Every card is clickable (`cardTarget`): `movie` cards carry `movies.id` → open `MovieModal`; `director`/`year`/`decade` cards carry `value` → open `DirectorYearModal` (the same group view the Rankings page uses). Value types mirror Rankings: director = name, year = `String`, decade = number (start year). Requires `ANTHROPIC_API_KEY` in the root `.env` (loaded by dotenv). If the key is unset, `/api/chat` returns a graceful "chat unavailable" reply instead of erroring — the rest of the app is unaffected.
- **How it reaches data**: one tool, `run_sql`, backed by a **separate libSQL client** (`server/db-readonly.js`), ideally authenticated with a Turso read-only token so the engine itself rejects writes — see [Database / persistence](#database--persistence-turso). `runReadOnlySql` additionally rejects anything not starting with `SELECT`/`WITH`, relies on `client.execute()` rejecting multi-statement strings, and caps results at 200 rows.
- **`movie_scores`** (a permanent `VIEW` in the main schema, shared by both connections — see [Database / persistence](#database--persistence-turso)) exposes the derived scores that otherwise live only in JS (`enrichMovie`): `voter_count`, `fair_score`, `boost`, `fair_boosted`, `boosted_score`, `std_dev`. `boost` uses the same `(11 - rank) / 10.0` formula as `server/scoring.js`'s `rankBonus`, inlined as SQL — no formula duplication. The system prompt documents the base tables + this view + voter names + `GROUP_SIZE`, so the model queries correct numbers directly.
- **Defaults to all films**: the system prompt forbids any `voter_count` filter unless the user explicitly asks for reliable / most-rated results. Sparsely-rated films (whose `fair_boosted`/`boosted_score`/`std_dev` are `NULL`) still appear in listings, ranked last. The scores view leaves those rows in with null scores rather than filtering them.
- **Flow**: `POST /api/chat { messages: [{role, content}] }` → `server/routes/chat.js` (behind `requireAuth`, passes `req.session.voter` so "what should I watch" is personalised) → `llm.chat()` → `{ reply }`. Errors are returned as a reply bubble, not a 5xx. Client keeps text-only history in `Chat.jsx` state and re-posts it each turn (stateless server); the tool loop's `tool_use`/`tool_result` blocks never leave the server. System prompt is `cache_control: ephemeral` for prompt-cache reuse across turns.
- **Env**: `ANTHROPIC_API_KEY` is forwarded to both services in `docker-compose.yml` and must be added by hand to the production server's `.env` (gitignored) — a missing key silently disables the chatbot, same pattern as `OMDB_API_KEY`.

## Environments (prod / dev)
Two environments, each on its own branch and its own Turso database. Roles were swapped on 2026-08-12: Oracle became prod (faster, no idle spin-down), Render became dev.

| | **PROD** | **DEV** |
|---|---|---|
| Host | Oracle Cloud VM, Milan (`130.110.13.27`) | Render Web Service, Frankfurt |
| URL | `http://130.110.13.27:3000` — **no TLS** | `https://movienight-prod.onrender.com` |
| Branch | `main` | `dev` |
| Turso DB | `movies` | `movies-dev` |
| Deploy | **manual**, two ways: the `Deploy to prod` GitHub Action (`deploy.yml`, `workflow_dispatch` — inputs `ref` and `rebuild`; needs secrets `SSH_PRIVATE_KEY`/`SSH_HOST`/`SSH_USER` and optional variable `DEPLOY_PATH`), or `git pull && docker compose up -d --build` on the box | auto-deploys on push to `dev` |
| Runs via | `docker-compose.yml` + root `.env` | Dockerfile + Render dashboard env vars |

**Workflow**: work on `dev` → Render deploys it automatically → verify → merge `dev` → `main` → pull on the Oracle box. The merge is the gate; prod only ever runs code that already ran on dev. (Before this split, both hosts ran `main` and every push went straight to production — that's how the crash bug in `af30411` reached prod for ~45 minutes.)

**Isolation is enforced by tokens, not convention.** Both databases live in the same Turso group (`movie-nights`) but have separate database-scoped tokens; the prod token gets a 401 against dev and vice versa. Verified by inserting a probe row into dev and confirming prod never saw it.

**Caveats**
- ⚠️ **Prod has no HTTPS.** Passwords and session cookies cross the internet in clear text. Fixing this needs a hostname (a free DuckDNS subdomain works) plus Caddy for automatic Let's Encrypt certs.
- Prod's OCI ingress rule is open to `0.0.0.0/0` on all ports — narrow it to 22 + 3000.
- Sessions are in-memory (`express-session`, no store), so any restart on either host **logs everyone out**. A Turso-backed session store would fix it.
- `GUEST_PASSWORD` (the Σάκιας guest login) exists in the Oracle `.env` but not on Render, so guest login works on prod only.
- Don't set `PORT` on Render — it injects its own, and `server/index.js` already reads `process.env.PORT`.
- Render's `[skip render]` marker (also `[skip deploy]` / `[skip cd]`) suppresses a deploy for a given commit. The nightly `seed.json` refresh uses it. Now that Render tracks `dev` and the bot commits to `main`, it no longer has anything to suppress there — but it's kept for when `main` is merged into `dev`.
- The Oregon Render service (`movienight-ghpk`) is **suspended**, not deleted, and holds a revoked token.

## DB backup & seed refresh

**Why snapshots exist when Turso is the live database.** Turso is hosting, not backup — it keeps the current state highly available, which is a different job:
- **Application and human error replicate instantly.** A bad migration, a mis-aimed `PATCH`, or `POST /api/movies/watchlist/reset` with `mode: 'all'` is a perfectly valid write. Managed durability preserves it faithfully; only a yesterday's-copy does not.
- **They're provider- and account-independent.** The dumps are plain SQLite text on a git branch, restorable into any SQLite engine. Losing the Turso account, or having a token invalidated, doesn't touch them — and token invalidation is group-wide here, so it takes prod and dev at once.
- **`seed.json` is a separate job entirely.** It isn't disaster recovery: it's what lets a fresh clone or a local dev run start with current data and no Turso credentials at all.
- **They turned out to be a time series nobody designed.** `ratings` has never had a timestamp, so the entire pre-feature rating history was reconstructed by diffing consecutive daily dumps — see [Backfill](#backfill--serverscriptsbackfill-rating-historyjs). Point-in-time copies answered a question the live database structurally could not.

`.github/workflows/db-backup.yml` runs daily at 02:00 UTC (also `workflow_dispatch`-able) and is driven by `server/scripts/backup-and-seed.js`. It reads the **prod** Turso database (`movies`) over the network — **no SSH, no host dependency** — and produces two artifacts:

| Artifact | Destination | Purpose |
|---|---|---|
| `movies_YYYY-MM-DD.sql` | `backups` branch, 7-day rolling window | Restorable snapshot: `sqlite3 movies.db < movies_2026-08-12.sql` |
| refreshed `server/data/seed.json` | `main`, committed with `[skip render]` | A fresh clone seeds a local DB with **current** data |

- **Required repo secrets**: `TURSO_DATABASE_URL`, `TURSO_READONLY_AUTH_TOKEN`.
- **Comments are deliberately excluded** from both artifacts — the repo is public and per-voter comments are personal notes. The `ratings.comment` column still exists in the dumped schema, so restored rows just get `''`. Ratings, Top-10 picks, watchlist votes and IMDb data *are* included.
- **`seed.json` now carries `imdb_id`/`imdb_rating`**, so a local run doesn't re-fetch everything from OMDb (a fresh cloner won't have an `OMDB_API_KEY`). `seed.js` also seeds `watchlist_votes`.
- Output is pretty-printed with stable key/row ordering (`ORDER BY id`, voters in `VOTERS` order) so an unchanged day produces **no diff at all**, and a changed day produces a small readable one. The regenerated file has no UTF-8 BOM; `seed.js`'s BOM strip is conditional so both forms work.
- **Legacy `movies_*.db` files on the `backups` branch are never pruned** — only `movies_*.sql` ages out. Those binary snapshots are the only surviving record of the pre-Turso database.

### Getting a DB into Turso
There's no "SSH into the instance and copy a file" step anymore — data is imported into Turso directly; see [Database / persistence](#database--persistence-turso). Recoverable starting points: any `.sql` snapshot on the `backups` branch, the legacy `movies_*.db` files there, or `main`'s history at commit `6956940` for the 2026-08-08 pre-migration snapshot.

## Color scheme (score thresholds)
- ≥ 7.5 → green (`score-high`)
- ≥ 5.0 → yellow/gold (`score-mid`)
- < 5.0 → red (`score-low`)

MN (Movie Night) badge is **green** throughout the app.
