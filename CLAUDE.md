# Movie Nights — Project Context

## What this is
A full-stack web app that replaces a Google Sheets spreadsheet used by a group of 5 friends to rate films, track Movie Night sessions, and maintain rankings. Seeded from 834 films originally in the spreadsheet.

## Stack
- **Frontend**: React 18 + Vite, React Router v6, no UI library
- **Backend**: Node.js + Express
- **Database**: SQLite via `better-sqlite3` (WAL mode, foreign keys ON)
- **Containerisation**: Docker (single `Dockerfile`, client build + server runtime); `docker-compose.yml` is for **local** use only
- **Hosting**: Render (Web Service built from `Dockerfile`), migrated from a self-managed SSH/Docker Compose host on 2026-08-10. Requires a Render **Persistent Disk** mounted at `/app/data` (matches `DATA_DIR`) — without it, every deploy wipes the DB back to the 834-film seed. Render auto-deploys from GitHub on push; the old SSH-based `.github/workflows/deploy.yml` is deprecated (`workflow_dispatch` only, no longer runs on push).

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
│           ├── Stats.jsx / .css         # Per-voter overview + head-to-head comparison
│           └── Chat.jsx / .css          # Natural-language chatbot over the DB (read-only)
├── server/
│   ├── index.js              # Express entry point, seeds DB, mounts routes
│   ├── db.js                 # SQLite setup, schema creation, migrations
│   ├── seed.js               # One-time seeding from data/seed.json
│   ├── omdb.js               # OMDb helpers: lookupImdb, searchImdb (fuzzy), getImdbById, extractImdbId
│   ├── db-readonly.js        # Read-only SQLite connection + movie_scores view + runReadOnlySql (chatbot)
│   ├── llm.js                # Anthropic chatbot: text-to-SQL tool runner (claude-sonnet-5)
│   ├── data/
│   │   ├── seed.json         # 834 films (has UTF-8 BOM — stripped in seed.js); directors stored as full names
│   │   └── movies.db         # SQLite file (gitignored, persisted via volume)
│   ├── routes/
│   │   ├── movies.js         # CRUD + enrichMovie (scores, ratings, comments)
│   │   ├── rankings.js       # 12 ranking panels across 4 row groups
│   │   ├── recommendations.js  # GET /api/recommendations — Bayesian ranked picks
│   │   └── chat.js           # POST /api/chat — natural-language chatbot (read-only)
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
top3    (id, movie_id → movies, voter TEXT, rank INT CHECK(rank>=1 AND rank<=10),  UNIQUE(movie_id, voter))  -- legacy name; now Top 10
watchlist_votes (id, movie_id → movies, voter TEXT,  UNIQUE(movie_id, voter))
```
Seeding is idempotent — skips if `COUNT(*) > 0` in movies.
`imdb_id` / `imdb_rating` are populated from OMDb on add and shown in the UI — see [IMDb integration](#imdb-integration).
`watchlist_votes` rows are deleted when a film leaves the watchlist (and cascade on film delete).

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
| `boost` | Σ rank bonuses | `rankBonus(r) = (11 − r)/10` per voter who placed film in their Top 10 |

- **Top 10 bonus**: linear rank-weighted — `rankBonus(rank) = (11 − rank) / 10`, i.e. #1 = +1.0, #2 = +0.9 … #10 = +0.1. Defined once in `server/scoring.js` (and mirrored in `MovieModal.jsx` for the live preview). Max boost = 5 × 1.0 = +5.0. Both `boostedScore` and `fairBoosted` are capped at 10. Icons: 🥇🥈🥉 for ranks 1–3, a number badge (`RankIcon`) for 4–10.
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
- **Live rank badges** (Films page): `allMovies` state (always full, unfiltered) feeds a `rankMap` memo that computes fair/group/mnFair/mnGroup rank positions using the same tiebreaker order as `rankings.js`. MovieCard receives `rank_global` and `mn_rank` from this map, not from the DB column. MN badge shows `MN #N` where N is the MN-specific rank matching the active score mode.
- **Rankings refetch on navigate**: `Rankings.jsx` uses `useLocation().key` as a `useEffect` dependency — React Router changes `.key` on every navigation, so rankings always reload when switching to the Rankings tab.
- **`stdDev`**: computed in `enrichMovie()` as `sqrt(Σ(score - mean)² / n)`, rounded to 2dp. `null` when `n < 2`. Used by Controversy page and "Most Controversial" sort. Color thresholds: `<1` → green (consensus), `1–2` → gold, `≥2` → red (polarising).
- **Controversy page** (`/controversy`): fetches all rated films client-side, filters to `voterCount ≥ 2 && stdDev != null`, sorts by `stdDev DESC`. Per-voter score pills colored by individual score.
- **Stats page** (`/stats`): fetches all 834 films once, computes everything client-side via `useMemo`. Per-voter cards show rated count, mean score, top-10 pick count, fav director/decade, score distribution bar chart; clicking a card opens a drill-down modal (top/bottom films, director/decade breakdown). An "Everyone's Top 10" section lists each voter's ranked picks. (Voter head-to-head moved to the `/compare` page.)
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

## Chatbot — "HAL 9000" (natural-language Q&A)
`/chat` page lets any logged-in voter ask free-form questions about the data ("which director do we rate highest?", "what should I watch from the watchlist?"). **Read-only** — it can query the DB but never mutate it. The chatbot is branded as **HAL 9000**; the entry point is a red HAL-eye SVG (`HalLink` in `Header.jsx`) placed **left of the theme selector** in `header-right` (and in the mobile footer) — it is **not** a nav-bar page link.

- **Model**: `claude-sonnet-5` via the Anthropic SDK **tool runner** (`server/llm.js`), persona = HAL 9000. Thinking is disabled to keep chat responses snappy.
- **Cards**: when an answer lists films/directors/years/decades, HAL appends a fenced ` ```cards ` block holding a JSON array (`{ type, id?, value?, title, meta, score, scoreLabel }`). `Chat.jsx` parses that block out of the reply (`parseReply`) and renders a **column of cards** styled like the Stats-page highlight tiles (`hal-card*` classes). Every card is clickable (`cardTarget`): `movie` cards carry `movies.id` → open `MovieModal`; `director`/`year`/`decade` cards carry `value` → open `DirectorYearModal` (the same group view the Rankings page uses). Value types mirror Rankings: director = name, year = `String`, decade = number (start year). Requires `ANTHROPIC_API_KEY` in the root `.env` (loaded by dotenv). If the key is unset, `/api/chat` returns a graceful "chat unavailable" reply instead of erroring — the rest of the app is unaffected.
- **How it reaches data**: one tool, `run_sql`, backed by a **separate read-only connection** (`new Database(DB_PATH, { readonly: true })` in `server/db-readonly.js`). SQLite rejects every write at the engine level, so the read-only guarantee doesn't depend on the prompt. `runReadOnlySql` additionally rejects anything not starting with `SELECT`/`WITH`, relies on better-sqlite3's single-statement `.prepare()`, and caps results at 200 rows.
- **`movie_scores` TEMP VIEW** (created on the read-only connection) exposes the derived scores that otherwise live only in JS (`enrichMovie`): `voter_count`, `fair_score`, `boost`, `fair_boosted`, `boosted_score`, `std_dev`. It reuses `rankBonus` from `server/scoring.js` as a registered SQL function (`rank_bonus`) — no formula duplication. The system prompt documents the base tables + this view + voter names + `GROUP_SIZE`, so the model queries correct numbers directly.
- **Defaults to all films**: the system prompt forbids any `voter_count` filter unless the user explicitly asks for reliable / most-rated results. Sparsely-rated films (whose `fair_boosted`/`boosted_score`/`std_dev` are `NULL`) still appear in listings, ranked last. The scores view leaves those rows in with null scores rather than filtering them.
- **Flow**: `POST /api/chat { messages: [{role, content}] }` → `server/routes/chat.js` (behind `requireAuth`, passes `req.session.voter` so "what should I watch" is personalised) → `llm.chat()` → `{ reply }`. Errors are returned as a reply bubble, not a 5xx. Client keeps text-only history in `Chat.jsx` state and re-posts it each turn (stateless server); the tool loop's `tool_use`/`tool_result` blocks never leave the server. System prompt is `cache_control: ephemeral` for prompt-cache reuse across turns.
- **Env**: `ANTHROPIC_API_KEY` is forwarded to both services in `docker-compose.yml` and must be added by hand to the production server's `.env` (gitignored) — a missing key silently disables the chatbot, same pattern as `OMDB_API_KEY`.

## Hosting: Render (current, since 2026-08-10)
Migrated off a self-managed SSH/Docker Compose host to a Render Web Service built directly from the repo's `Dockerfile`. Key differences from the old setup:
- Render's filesystem is **ephemeral** — a **Persistent Disk** must be attached and mounted at `/app/data` (matching `DATA_DIR`), or every deploy/restart wipes the DB back to the 834-film seed. Persistent Disks require a paid Render instance plan (not Free).
- Env vars (`MN_PASSWORD`, `SESSION_SECRET`, `GUEST_PASSWORD`, `OMDB_API_KEY`, `ANTHROPIC_API_KEY`, `NODE_ENV=production`) are set in the Render dashboard's Environment tab, not a server-side `.env`. Don't set `PORT` — Render injects its own and `server/index.js` already reads `process.env.PORT`.
- `docker-compose.yml` is **local-dev only** now; Render doesn't use Compose. The `sakias` 6-voter variant that used to run as a second Compose service was dropped in the migration (not recreated on Render).
- Sessions are still in-memory (`express-session`, no store), so every Render deploy/restart still **logs everyone out** — same caveat as before, plus Render's Free-tier idle spin-down (if used) would cause this more often than a redeploy alone would.

### Deploy
Render auto-deploys from GitHub on push (or via a manual deploy from the dashboard) — this is configured in Render, not in this repo. The old `[deploy]`-in-commit-message convention and `.github/workflows/deploy.yml` (SSH into the old host) are **deprecated**: the workflow no longer triggers on push (`workflow_dispatch` only) since there's no SSH target anymore. Whether pushing to `main` deploys to Render depends on that service's auto-deploy setting in the Render dashboard.

### DB backup — currently disabled, needs redesign
The old `.github/workflows/db-backup.yml` (daily SSH pull from the Docker volume → `backups` branch) has no valid target on Render and was disabled (schedule removed, `workflow_dispatch` only) rather than fixed. **There is currently no automated backup running.** A Render-compatible replacement (e.g. an authenticated HTTPS route on the app that streams the DB file, polled by a GitHub Action) still needs to be built.

### Restoring a DB onto the Render disk
Render's persistent disk starts empty on first attach — getting an existing `movies.db` onto it requires Render's Shell/SSH into the running instance (dashboard → Shell tab), there's no `scp`-to-Docker-volume equivalent. The most recent pre-migration snapshot is still recoverable from the `backups` branch (`git fetch origin backups`, or from `main`'s history at commit `6956940` for the 2026-08-08 snapshot) if needed.

## Color scheme (score thresholds)
- ≥ 7.5 → green (`score-high`)
- ≥ 5.0 → yellow/gold (`score-mid`)
- < 5.0 → red (`score-low`)

MN (Movie Night) badge is **green** throughout the app.
