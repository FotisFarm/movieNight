// Background worker and scheduler for daily Letterboxd rating synchronization.
//
// Highlights:
// - Paced requests (1.5s delay) to be respectful to network and services.
// - Resumable: tracks `letterboxd_updated_at` per film so restarts never re-check already synced films.
// - Decoy protection: strictly validates against Letterboxd's anti-scraping 3.43 placeholder,
//   ensuring real catalog ratings are never overwritten by automated honeypots.
// - Admin monitorable: exposes real-time status and manual trigger endpoints.

const db = require('./db');
const { fetchLetterboxdRating, DECOY_RATING } = require('./letterboxd');

const DELAY_BETWEEN_REQUESTS_MS = 1500;
const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const CHECK_SCHEDULE_INTERVAL_MS = 60 * 60 * 1000; // Check hourly

let isRunning = false;
let abortRequested = false;
let schedulerTimer = null;
let lastRunInfo = {
  startedAt: null,
  finishedAt: null,
  totalChecked: 0,
  updatedCount: 0,
  decoysBlocked: 0,
  skippedCount: 0,
  errorsCount: 0,
  status: 'idle'
};

let currentProgress = {
  current: 0,
  total: 0,
  movieTitle: null,
  percent: 0
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getSyncStatus() {
  return {
    isRunning,
    currentProgress: isRunning ? currentProgress : null,
    lastRun: lastRunInfo,
    config: {
      delayMs: DELAY_BETWEEN_REQUESTS_MS,
      intervalHours: 24
    }
  };
}

function stopLetterboxdSync() {
  if (isRunning) {
    abortRequested = true;
    return { ok: true, message: 'Sync abortion requested' };
  }
  return { ok: false, message: 'No sync in progress' };
}

async function runLetterboxdSync({ forceAll = false } = {}) {
  if (isRunning) {
    return { ok: false, message: 'Letterboxd sync is already running', status: getSyncStatus() };
  }

  isRunning = true;
  abortRequested = false;

  const startedAt = new Date().toISOString();
  lastRunInfo = {
    startedAt,
    finishedAt: null,
    totalChecked: 0,
    updatedCount: 0,
    decoysBlocked: 0,
    skippedCount: 0,
    errorsCount: 0,
    status: 'running'
  };

  try {
    let query = `
      SELECT id, title, imdb_id, letterboxd_rating, letterboxd_updated_at
      FROM movies
      WHERE imdb_id IS NOT NULL AND imdb_id != ''
    `;

    if (!forceAll) {
      query += ` AND (letterboxd_updated_at IS NULL OR letterboxd_updated_at < datetime('now', '-23 hours'))`;
    }

    query += ` ORDER BY COALESCE(letterboxd_updated_at, '1970-01-01') ASC`;

    const movies = await db.all(query);
    const total = movies.length;

    console.log(`[letterboxd-sync] Starting daily sync for ${total} movies (forceAll=${forceAll})`);

    currentProgress = {
      current: 0,
      total,
      movieTitle: null,
      percent: 0
    };

    for (let i = 0; i < total; i++) {
      if (abortRequested) {
        console.log('[letterboxd-sync] Abort requested. Halting sync.');
        lastRunInfo.status = 'aborted';
        break;
      }

      const movie = movies[i];
      currentProgress.current = i + 1;
      currentProgress.movieTitle = movie.title;
      currentProgress.percent = total > 0 ? Math.round(((i + 1) / total) * 100) : 100;

      try {
        const liveScore = await fetchLetterboxdRating(movie.imdb_id);

        if (liveScore != null) {
          if (liveScore !== movie.letterboxd_rating) {
            await db.run(
              "UPDATE movies SET letterboxd_rating = ?, letterboxd_updated_at = datetime('now') WHERE id = ?",
              liveScore, movie.id
            );
            lastRunInfo.updatedCount++;
            console.log(`[letterboxd-sync] [${i + 1}/${total}] Updated "${movie.title}" (${movie.imdb_id}): ${movie.letterboxd_rating} -> ${liveScore}`);
          } else {
            await db.run(
              "UPDATE movies SET letterboxd_updated_at = datetime('now') WHERE id = ?",
              movie.id
            );
            lastRunInfo.skippedCount++;
          }
        } else {
          // Score was null or blocked as decoy (3.43). We still update letterboxd_updated_at
          // so this film doesn't indefinitely block the queue, but we NEVER touch letterboxd_rating.
          await db.run(
            "UPDATE movies SET letterboxd_updated_at = datetime('now') WHERE id = ?",
            movie.id
          );
          lastRunInfo.decoysBlocked++;
        }

        lastRunInfo.totalChecked++;
      } catch (err) {
        console.warn(`[letterboxd-sync] Error on "${movie.title}":`, err.message);
        lastRunInfo.errorsCount++;
      }

      if (i < total - 1 && !abortRequested) {
        await sleep(DELAY_BETWEEN_REQUESTS_MS);
      }
    }

    if (lastRunInfo.status !== 'aborted') {
      lastRunInfo.status = 'completed';
    }
  } catch (err) {
    console.error('[letterboxd-sync] Fatal sync error:', err);
    lastRunInfo.status = 'error';
    lastRunInfo.error = err.message;
  } finally {
    lastRunInfo.finishedAt = new Date().toISOString();
    isRunning = false;
    currentProgress = { current: 0, total: 0, movieTitle: null, percent: 0 };
    console.log(`[letterboxd-sync] Sync finished: checked=${lastRunInfo.totalChecked}, updated=${lastRunInfo.updatedCount}, decoysBlocked=${lastRunInfo.decoysBlocked}, errors=${lastRunInfo.errorsCount}`);
  }

  return { ok: true, stats: lastRunInfo };
}

function startLetterboxdSyncScheduler() {
  if (schedulerTimer) return;

  console.log('[letterboxd-sync] Scheduler initialized. Checking daily intervals...');

  // Wait 3 minutes after server boots before the first check
  setTimeout(async () => {
    try {
      const pending = await db.get(`
        SELECT COUNT(*) AS c
        FROM movies
        WHERE imdb_id IS NOT NULL AND imdb_id != ''
          AND (letterboxd_updated_at IS NULL OR letterboxd_updated_at < datetime('now', '-23 hours'))
      `);

      if (pending?.c > 0 && !isRunning) {
        console.log(`[letterboxd-sync] Found ${pending.c} movies due for daily Letterboxd check. Running sync...`);
        runLetterboxdSync().catch(err => console.error('[letterboxd-sync] Sync failed:', err));
      }
    } catch (e) {
      console.warn('[letterboxd-sync] Initial schedule check notice:', e.message);
    }
  }, 3 * 60 * 1000);

  // Hourly recurring check
  schedulerTimer = setInterval(async () => {
    try {
      if (isRunning) return;

      const pending = await db.get(`
        SELECT COUNT(*) AS c
        FROM movies
        WHERE imdb_id IS NOT NULL AND imdb_id != ''
          AND (letterboxd_updated_at IS NULL OR letterboxd_updated_at < datetime('now', '-23 hours'))
      `);

      if (pending?.c > 0) {
        console.log(`[letterboxd-sync] Hourly check: ${pending.c} movies due for sync. Launching background task...`);
        runLetterboxdSync().catch(err => console.error('[letterboxd-sync] Background sync error:', err));
      }
    } catch (e) {
      console.warn('[letterboxd-sync] Hourly check notice:', e.message);
    }
  }, CHECK_SCHEDULE_INTERVAL_MS);

  if (schedulerTimer.unref) schedulerTimer.unref();
}

module.exports = {
  getSyncStatus,
  runLetterboxdSync,
  stopLetterboxdSync,
  startLetterboxdSyncScheduler
};
