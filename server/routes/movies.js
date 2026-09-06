const express = require('express');
const db = require('../db');
const { rankBonus } = require('../scoring');
const { lookupImdb, searchImdb, getImdbById, extractImdbId } = require('../omdb');
const { findByImdbId, lookupPosterPath, getMovieDetails, lookupMovieRuntime } = require('../tmdb');
const { fetchLetterboxdRating } = require('../letterboxd');
const ah = require('../asyncHandler');
const { enrichMovie, enrichMoviesBatch } = require('../enrich');

const router = express.Router();

const { VOTERS, GROUP_SIZE } = require('../config');

// GET /api/movies
router.get('/', ah(async (req, res) => {
  const { search, director, year, yearMin, yearMax, voter, voters, mn, watchlist, rated, minVoters, maxVoters } = req.query;

  let query = 'SELECT * FROM movies WHERE 1=1';
  const params = [];


  if (search)   { query += ' AND title LIKE ?'; params.push(`%${search}%`); }
  if (director) { query += ' AND director = ?'; params.push(director); }
  if (year)     { query += ' AND year = ?';     params.push(year); }
  if (yearMin)  { query += ' AND CAST(year AS INTEGER) >= ?'; params.push(parseInt(yearMin)); }
  if (yearMax)  { query += ' AND CAST(year AS INTEGER) <= ?'; params.push(parseInt(yearMax)); }
  if (mn === '1')        { query += ' AND mn = 1'; }
  if (watchlist === '1') { query += ' AND watchlist = 1'; }

  const voterList = (voters ? voters.split(',') : voter ? [voter] : []).map(v => v.trim()).filter(Boolean);
  if (voterList.length) {
    const exists = rated === 'unvoted'
      ? 'AND NOT EXISTS (SELECT 1 FROM ratings WHERE movie_id = movies.id AND voter = ?)'
      : 'AND EXISTS (SELECT 1 FROM ratings WHERE movie_id = movies.id AND voter = ?)';
    for (const v of voterList) {
      query += ` ${exists}`;
      params.push(v);
    }
  } else if (rated === 'voted' || rated === '1') {
    query += ' AND EXISTS (SELECT 1 FROM ratings WHERE movie_id = movies.id)';
  } else if (rated === 'unvoted') {
    query += ' AND NOT EXISTS (SELECT 1 FROM ratings WHERE movie_id = movies.id)';
  }

  if (minVoters) {
    query += ' AND (SELECT COUNT(*) FROM ratings WHERE movie_id = movies.id) >= ?';
    params.push(parseInt(minVoters));
  }
  if (maxVoters !== undefined && maxVoters !== '') {
    query += ' AND (SELECT COUNT(*) FROM ratings WHERE movie_id = movies.id) <= ?';
    params.push(parseInt(maxVoters));
  }

  query += ' ORDER BY title COLLATE NOCASE ASC';

  const movies = await db.all(query, ...params);
  res.json(await enrichMoviesBatch(movies));
}));

// GET /api/movies/:id/history  — every voter's score and Top 10 trail for one
// film. Deliberately NOT part of enrichMovie: that runs over all ~850 films on
// the Films, Stats and Picks pages, and rating_history is the one table here
// that grows without bound. Fetched per film, on demand, and cached client-side.
router.get('/:id/history', ah(async (req, res) => {
  const rows = await db.all(`
    SELECT voter, kind, score, rank, changed_by, source, changed_at
    FROM rating_history
    WHERE movie_id = ?
    ORDER BY changed_at, id
  `, req.params.id);

  // Grouped by voter so the client can draw one series per pill without regrouping.
  const byVoter = {};
  for (const row of rows) {
    (byVoter[row.voter] ||= []).push({
      kind: row.kind,
      score: row.score,
      rank: row.rank,
      changedBy: row.changed_by,
      source: row.source,
      changedAt: row.changed_at,
    });
  }
  res.json(byVoter);
}));

// POST /api/movies/:id/watchlist-vote  — must be before /:id
router.post('/:id/watchlist-vote', ah(async (req, res) => {
  const id = Number(req.params.id);
  const sessionVoter = req.session.voter;
  const voter = (sessionVoter === 'mnAdmin' && req.body.targetVoter) ? req.body.targetVoter : sessionVoter;
  const exists = await db.get('SELECT 1 FROM watchlist_votes WHERE movie_id=? AND voter=?', id, voter);
  if (exists) {
    await db.run('DELETE FROM watchlist_votes WHERE movie_id=? AND voter=?', id, voter);
  } else {
    if (sessionVoter !== 'mnAdmin') {
      const { c: count } = await db.get('SELECT COUNT(*) as c FROM watchlist_votes WHERE voter=?', voter);
      if (count >= 3) return res.status(400).json({ error: 'vote_limit' });
    }
    await db.run('INSERT INTO watchlist_votes (movie_id, voter) VALUES (?,?)', id, voter);
  }
  res.json({ ok: true });
}));

// GET /api/movies/directors  — must be before /:id
router.get('/directors', ah(async (_req, res) => {
  const rows = await db.all("SELECT DISTINCT director FROM movies WHERE director != '' ORDER BY director COLLATE NOCASE");
  res.json(rows.map(r => r.director));
}));

// GET /api/movies/top10-counts  — { voter: number of top picks }. Must be before /:id.
router.get('/top10-counts', ah(async (_req, res) => {
  const rows = await db.all('SELECT voter, COUNT(*) AS n FROM top3 GROUP BY voter');
  const counts = {};
  for (const v of VOTERS) counts[v] = 0;
  for (const r of rows) counts[r.voter] = r.n;
  res.json(counts);
}));

// GET /api/movies/top10/:voter  — voter's current Top 10 in rank order. Must be before /:id.
router.get('/top10/:voter', ah(async (req, res) => {
  const { voter } = req.params;
  if (!VOTERS.includes(voter)) return res.status(404).json({ error: 'Voter not found' });
  const rows = await db.all(`
    SELECT m.id, m.title, m.year, m.director, m.poster_path, t.rank
    FROM top3 t
    JOIN movies m ON m.id = t.movie_id
    WHERE t.voter = ?
    ORDER BY t.rank ASC
  `, voter);
  res.json(rows);
}));

// PUT /api/movies/top10  — rewrite the session voter's own top picks (ranks 1..N) in order.
// Must be before /:id. Permission is implicit: it only ever touches req.session.voter's rows.
router.put('/top10', ah(async (req, res) => {
  const sessionVoter = req.session.voter;
  const isAdmin = sessionVoter === 'mnAdmin';
  // Admins may target any voter; everyone else can only rewrite their own.
  if (!isAdmin && req.body.voter && req.body.voter !== sessionVoter) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const voter = isAdmin && req.body.voter ? req.body.voter : sessionVoter;
  const order = Array.isArray(req.body.order) ? req.body.order : null;
  if (!order || !VOTERS.includes(voter)) return res.status(400).json({ error: 'Bad request' });
  const ids = order.map(Number).filter(Boolean).slice(0, 10);

  // Snapshot before the rewrite so the trail can record what actually moved.
  // This is a delete-and-reinsert, so without the diff every drag would either
  // log nothing (as it used to) or log all ten picks as changed.
  const rowsBefore = await db.all('SELECT movie_id, rank FROM top3 WHERE voter = ?', voter);
  const ranksBefore = new Map(rowsBefore.map(r => [r.movie_id, r.rank]));

  await db.transaction(async (tx) => {
    await tx.run('DELETE FROM top3 WHERE voter = ?', voter);
    for (let i = 0; i < ids.length; i++) {
      await tx.run('INSERT INTO top3 (movie_id, voter, rank) VALUES (?, ?, ?)', ids[i], voter, i + 1);
    }
  });

  // Same shape as the PATCH /:id path: one row per film whose position changed,
  // rank NULL meaning it left this voter's Top 10. changed_by is the session
  // voter, so an admin reordering someone else's picks is attributed correctly.
  const ranksAfter = new Map(ids.map((movieId, index) => [movieId, index + 1]));
  for (const movieId of new Set([...ranksBefore.keys(), ...ranksAfter.keys()])) {
    const previous = ranksBefore.has(movieId) ? ranksBefore.get(movieId) : null;
    const rank = ranksAfter.has(movieId) ? ranksAfter.get(movieId) : null;
    if (previous === rank) continue;
    await db.run(`
      INSERT INTO rating_history (movie_id, voter, kind, rank, changed_by)
      VALUES (?, ?, 'top10', ?, ?)
    `, movieId, voter, rank, sessionVoter || '');
  }

  res.json({ ok: true });
}));

// POST /api/movies/watchlist/reset  — admin only. Must be before /:id.
// mode 'votes' clears every watchlist vote; mode 'all' also empties the watchlist itself.
router.post('/watchlist/reset', ah(async (req, res) => {
  if (req.session.voter !== 'mnAdmin') return res.status(403).json({ error: 'Admin only' });
  const mode = req.body?.mode;
  if (mode !== 'votes' && mode !== 'all') return res.status(400).json({ error: 'mode must be "votes" or "all"' });

  const result = await db.transaction(async (tx) => {
    const { changes: votes } = await tx.run('DELETE FROM watchlist_votes');
    let cleared = 0;
    if (mode === 'all') {
      ({ changes: cleared } = await tx.run('UPDATE movies SET watchlist = 0 WHERE watchlist = 1'));
    }
    return { votesCleared: votes, filmsCleared: cleared };
  });

  res.json(result);
}));

// GET /api/movies/imdb-search?title=&year=  — resolve an exact OMDb match or return candidates.
// Must be before /:id.
router.get('/imdb-search', ah(async (req, res) => {
  const title = (req.query.title || '').trim();
  const year = (req.query.year || '').trim();
  if (!title) return res.json({ status: 'none', candidates: [] });

  const candidates = await searchImdb(title, year);
  const norm = s => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const exact = candidates.find(c => norm(c.title) === norm(title) && (!year || String(c.year) === String(year)));
  if (exact) return res.json({ status: 'exact', match: exact });
  if (candidates.length) return res.json({ status: 'candidates', candidates });
  return res.json({ status: 'none', candidates: [] });
}));

// GET /api/movies/imdb-detail?imdbId=  — full OMDb details for a chosen candidate. Must be before /:id.
router.get('/imdb-detail', ah(async (req, res) => {
  const imdbId = (req.query.imdbId || '').trim();
  const detail = await getImdbById(imdbId);
  if (!detail) return res.status(404).json({ error: 'Not found' });
  res.json(detail);
}));

// POST /api/movies/backfill-runtimes — manually trigger runtime backfill if needed
router.post('/backfill-runtimes', ah(async (req, res) => {
  const { force = false } = req.body || {};
  let data;
  try {
    data = require('../initial-runtimes.json');
  } catch (_) {
    try {
      data = require('../data/initial-runtimes.json');
    } catch (e) {
      return res.status(500).json({ error: 'initial-runtimes.json not found: ' + e.message });
    }
  }

  const entries = Object.entries(data);
  const CHUNK = 100;
  for (let i = 0; i < entries.length; i += CHUNK) {
    const slice = entries.slice(i, i + CHUNK);
    const whenClauses = slice.map(([id, rt]) => `WHEN ${parseInt(id, 10)} THEN ${parseInt(rt, 10)}`).join(' ');
    const ids = slice.map(([id]) => parseInt(id, 10)).join(',');
    const whereCond = force ? '' : 'AND (runtime IS NULL OR runtime = 0)';
    const sql = `UPDATE movies SET runtime = CASE id ${whenClauses} END WHERE id IN (${ids}) ${whereCond}`;
    await db.run(sql);
  }

  const stats = await db.get('SELECT COUNT(*) AS total, COUNT(runtime) AS with_runtime FROM movies');
  res.json({ success: true, updated: entries.length, stats });
}));

// GET /api/movies/:id
router.get('/:id', ah(async (req, res) => {
  const movie = await db.get('SELECT * FROM movies WHERE id = ?', req.params.id);
  if (!movie) return res.status(404).json({ error: 'Not found' });
  res.json(await enrichMovie(movie));
}));

// POST /api/movies
router.post('/', ah(async (req, res) => {
  const { director = '', title, year = '', mn = false, watchlist = false, imdb_id } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: 'title is required' });

  const { lastInsertRowid } = await db.run(`
    INSERT INTO movies (director, title, year, mn, watchlist)
    VALUES (?, ?, ?, ?, ?)
  `, director.trim(), title.trim(), year.trim(), mn ? 1 : 0, watchlist ? 1 : 0);

  // Best-effort IMDb enrichment — a failed/absent lookup must never block the add.
  // A client-supplied imdb_id (user picked a suggestion) is authoritative; otherwise fall back to title lookup.
  try {
    const imdb = imdb_id ? await getImdbById(imdb_id) : await lookupImdb(title.trim(), year.trim());
    let runtime = imdb?.runtime || null;
    let posterPath = null;
    try {
      if (imdb?.imdbId) {
        const tmdbFound = await findByImdbId(imdb.imdbId);
        if (tmdbFound?.posterPath) posterPath = tmdbFound.posterPath;
        if (!runtime && tmdbFound?.tmdbId) {
          const details = await getMovieDetails(tmdbFound.tmdbId);
          if (details?.runtime) runtime = details.runtime;
        }
      }
      if (!posterPath) {
        posterPath = await lookupPosterPath(imdb?.imdbId, title.trim(), year.trim());
      }
      if (!runtime) {
        runtime = await lookupMovieRuntime(imdb?.imdbId, title.trim(), year.trim());
      }
    } catch (_) { /* best effort */ }

    let letterboxdRating = null;
    if (imdb?.imdbId) {
      try {
        letterboxdRating = await fetchLetterboxdRating(imdb.imdbId);
      } catch (_) { /* best effort */ }
    }

    if (imdb?.imdbId || runtime || posterPath || letterboxdRating != null) {
      await db.run('UPDATE movies SET imdb_id = ?, imdb_rating = ?, letterboxd_rating = ?, poster_path = ?, runtime = ? WHERE id = ?',
        imdb?.imdbId ?? null, imdb?.imdbRating ?? null, letterboxdRating ?? null, posterPath ?? null, runtime ?? null, lastInsertRowid);
    }
  } catch (_) { /* film is still added even if metadata lookup is unavailable */ }

  res.status(201).json(await enrichMovie(
    await db.get('SELECT * FROM movies WHERE id = ?', lastInsertRowid)
  ));
}));

// PATCH /api/movies/:id
router.patch('/:id', ah(async (req, res) => {
  const id = parseInt(req.params.id);
  const movie = await db.get('SELECT * FROM movies WHERE id = ?', id);
  if (!movie) return res.status(404).json({ error: 'Not found' });

  const { director, title, year, mn, watchlist, cinobo, imdb_id, runtime, ratings, comments, top3 } = req.body;
  const sessionVoter = req.session.voter;
  const isAdmin = sessionVoter === 'mnAdmin';

  const updates = {};
  if (director !== undefined) updates.director = director;
  if (title !== undefined)    updates.title = title;
  if (year !== undefined)     updates.year = year;
  if (mn !== undefined)       updates.mn = mn ? 1 : 0;
  if (watchlist !== undefined) updates.watchlist = watchlist ? 1 : 0;
  if (cinobo !== undefined)   updates.cinobo = cinobo;
  if (runtime !== undefined)  updates.runtime = (runtime === null || runtime === '') ? null : parseInt(runtime, 10);
  // Setting/changing the IMDb id re-fetches the rating; clearing it wipes both.
  if (imdb_id !== undefined) {
    // The client may paste a full IMDb URL — store the extracted id, never the raw string.
    const cleanId = extractImdbId(imdb_id);
    if (!cleanId) {
      updates.imdb_id = null;
      updates.imdb_rating = null;
      updates.letterboxd_rating = null;
      // The poster was resolved from that id, so it goes too.
      updates.poster_path = null;
    } else {
      updates.imdb_id = cleanId;
      const [detail, lbRating] = await Promise.all([
        getImdbById(cleanId),
        fetchLetterboxdRating(cleanId).catch(() => null)
      ]);
      updates.imdb_rating = detail?.imdbRating ?? null;
      updates.letterboxd_rating = lbRating ?? null;
      if (detail?.runtime && updates.runtime === undefined) updates.runtime = detail.runtime;
      // Re-point the poster at the film the new id actually names. A TMDB
      // miss clears it rather than leaving the previous film's artwork.
      try {
        const found = await findByImdbId(cleanId);
        updates.poster_path = found?.posterPath ?? null;
        if (!updates.runtime && found?.tmdbId) {
          const tmdbDetails = await getMovieDetails(found.tmdbId);
          if (tmdbDetails?.runtime) updates.runtime = tmdbDetails.runtime;
        }
      } catch (_) { updates.poster_path = null; }
    }
  }

  if (Object.keys(updates).length > 0) {
    const setClause = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    await db.run(`UPDATE movies SET ${setClause} WHERE id = ?`, ...Object.values(updates), id);
  }

  // Leaving the watchlist discards the film's votes — a film re-added later starts fresh.
  if (watchlist !== undefined && !watchlist && movie.watchlist) {
    await db.run('DELETE FROM watchlist_votes WHERE movie_id = ?', id);
  }

  if (ratings) {
    const votersToRate = (isAdmin || VOTERS.includes(sessionVoter)) ? VOTERS : [sessionVoter];
    // One transaction so `ratings` and its history can't disagree — the history
    // is append-only, so a half-applied write here would never self-heal.
    await db.transaction(async (tx) => {
      // MovieModal PATCHes the whole ratings map on every save, so the new
      // value has to be diffed against the stored one: without this, editing a
      // film's title would append a no-op history row for every voter.
      const existing = await tx.all('SELECT voter, score FROM ratings WHERE movie_id = ?', id);
      const before = new Map(existing.map(r => [r.voter, r.score]));

      for (const voter of votersToRate) {
        if (voter in ratings) {
          if (!isAdmin && voter !== sessionVoter) continue;
          const raw = ratings[voter];
          const score = (raw === null || raw === '') ? null : parseFloat(raw);
          if (score === null) {
            await tx.run('DELETE FROM ratings WHERE movie_id = ? AND voter = ?', id, voter);
          } else {
            await tx.run(`
              INSERT INTO ratings (movie_id, voter, score) VALUES (?, ?, ?)
              ON CONFLICT(movie_id, voter) DO UPDATE SET score = excluded.score
            `, id, voter, score);
          }
          const previous = before.has(voter) ? before.get(voter) : null;
          if (previous !== score) {
            // changed_by is the session voter, not `voter` — mnAdmin can edit
            // someone else's rating, and the trail should say so.
            await tx.run(`
              INSERT INTO rating_history (movie_id, voter, kind, score, changed_by)
              VALUES (?, ?, 'score', ?, ?)
            `, id, voter, score, sessionVoter || '');
          }
        }
      }
    });
  }

  if (comments) {
    const votersToComment = (isAdmin || VOTERS.includes(sessionVoter)) ? VOTERS : [sessionVoter];
    for (const voter of votersToComment) {
      if (voter in comments) {
        if (!isAdmin && voter !== sessionVoter) continue;
        await db.run('UPDATE ratings SET comment = ? WHERE movie_id = ? AND voter = ?', comments[voter] || '', id, voter);
      }
    }
  }

  if (top3) {
    const movieIdNum = Number(id);
    const touched = new Set();

    // Snapshot each affected voter's whole Top 10 before anything moves: the
    // renumber/eviction step below can change the rank of films other than
    // this one, and those movements belong in the history too.
    const ranksBefore = new Map();
    for (const voter of VOTERS) {
      if (!(voter in top3)) continue;
      if (!isAdmin && voter !== sessionVoter) continue;
      const rows = await db.all('SELECT movie_id, rank FROM top3 WHERE voter = ?', voter);
      ranksBefore.set(voter, new Map(rows.map(r => [r.movie_id, r.rank])));
      touched.add(voter);
    }

    for (const voter of touched) {
      const raw = top3[voter];
      const targetRank = (raw != null && raw !== '') ? parseInt(raw, 10) : null;

      await db.transaction(async (tx) => {
        // Fetch existing picks for this voter excluding this film, in current rank order
        const otherRows = await tx.all(
          'SELECT movie_id FROM top3 WHERE voter = ? AND movie_id != ? ORDER BY rank, id',
          voter, movieIdNum
        );
        const otherIds = otherRows.map(r => r.movie_id);

        let finalIds;
        if (!targetRank || targetRank < 1 || targetRank > 10) {
          // Removal from Top 10: keep only other picks
          finalIds = otherIds.slice(0, 10);
        } else {
          // Ripple insertion: insert this film at (targetRank - 1), bumping existing picks down
          const insertIdx = Math.min(otherIds.length, Math.max(0, targetRank - 1));
          const newOrder = [...otherIds];
          newOrder.splice(insertIdx, 0, movieIdNum);
          finalIds = newOrder.slice(0, 10); // cap at 10, evicting any overflow past 10
        }

        // Rewrite top3 for this voter with contiguous ranks 1..finalIds.length
        await tx.run('DELETE FROM top3 WHERE voter = ?', voter);
        for (let i = 0; i < finalIds.length; i++) {
          await tx.run('INSERT INTO top3 (movie_id, voter, rank) VALUES (?, ?, ?)', finalIds[i], voter, i + 1);
        }
      });
    }

    // Now that ranks have settled, record every film whose position actually
    // moved — the one just edited, anything renumbered around it, and anything
    // the overflow rule evicted (rank null).
    for (const [voter, before] of ranksBefore) {
      const rows = await db.all('SELECT movie_id, rank FROM top3 WHERE voter = ?', voter);
      const after = new Map(rows.map(r => [r.movie_id, r.rank]));
      for (const movieId of new Set([...before.keys(), ...after.keys()])) {
        const previous = before.has(movieId) ? before.get(movieId) : null;
        const rank = after.has(movieId) ? after.get(movieId) : null;
        if (previous === rank) continue;
        await db.run(`
          INSERT INTO rating_history (movie_id, voter, kind, rank, changed_by)
          VALUES (?, ?, 'top10', ?, ?)
        `, movieId, voter, rank, sessionVoter || '');
      }
    }
  }

  res.json(await enrichMovie(await db.get('SELECT * FROM movies WHERE id = ?', id)));
}));

// DELETE /api/movies/:id
router.delete('/:id', ah(async (req, res) => {
  const result = await db.run('DELETE FROM movies WHERE id = ?', req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.status(204).end();
}));

module.exports = router;
