# Movie Nights

Film rating tracker for a small group. 834 films pre-loaded from the original spreadsheet.

## Run with Docker (recommended)

```bash
docker compose up --build
```

App available at **http://localhost:3000**.  
SQLite data is persisted in a named Docker volume (`sqlite_data`).

To run on a different port:
```bash
PORT=8080 docker compose up --build
```

## Run locally (dev)

Requires Node 18+.

```bash
# Install all deps
npm install
npm install --prefix server
npm install --prefix client

# Start both servers (hot-reload)
npm run dev
```

- Client (Vite): http://localhost:5173  
- API:           http://localhost:3001

## Backup the database

```bash
# From a running container
docker compose exec app sh -c "cp /app/data/movies.db /app/data/movies.bak.db"

# Copy to host
docker cp $(docker compose ps -q app):/app/data/movies.db ./movies-backup.db
```

## Scoring system

| Metric | Formula |
|---|---|
| Score | `sum of ratings / 5` (group size penalty for unrated) |
| Fair Score | `sum / n` (average of raters only) |
| Boost | `+0.7` per person who included it in their Top 3 |
| Boosted Score | `Score + Boost` |
| Fair Boosted | `min(10, FairScore + Boost)` |
