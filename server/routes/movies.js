const express = require('express');
const db = require('../db');
const { rankBonus } = require('../scoring');
const { lookupImdb, searchImdb, getImdbById, extractImdbId } = require('../omdb');
const { findByImdbId, lookupPosterPath, getMovieDetails, lookupMovieRuntime } = require('../tmdb');
const { fetchLetterboxdRating } = require('../letterboxd');
const ah = require('../asyncHandler');
const { enrichMovie, enrichMoviesBatch } = require('../enrich');

const router = express.Router();

const { VOTERS, GROUP_SIZE, SANDBOX_MODE } = require('../config');

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
  const groupId = req.group?.id || 1;
  if (mn === '1') {
    query += ' AND (EXISTS (SELECT 1 FROM group_movie_status gms WHERE gms.group_id = ? AND gms.movie_id = movies.id AND gms.mn = 1) ' +
             (groupId === 1 ? 'OR movies.mn = 1)' : ')');
    params.push(groupId);
  }
  if (watchlist === '1') {
    query += ' AND (EXISTS (SELECT 1 FROM group_movie_status gms WHERE gms.group_id = ? AND gms.movie_id = movies.id AND gms.watchlist = 1) ' +
             (groupId === 1 ? 'OR movies.watchlist = 1)' : ')');
    params.push(groupId);
  }

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
    const vList = req.group?.voters || VOTERS;
    const vPh = vList.map(() => '?').join(',');
    query += ` AND (SELECT COUNT(*) FROM ratings WHERE movie_id = movies.id AND voter IN (${vPh})) >= ?`;
    params.push(...vList, parseInt(minVoters));
  }
  if (maxVoters !== undefined && maxVoters !== '') {
    const vList = req.group?.voters || VOTERS;
    const vPh = vList.map(() => '?').join(',');
    query += ` AND (SELECT COUNT(*) FROM ratings WHERE movie_id = movies.id AND voter IN (${vPh})) <= ?`;
    params.push(...vList, parseInt(maxVoters));
  }

  query += ' ORDER BY title COLLATE NOCASE ASC';

  const movies = await db.all(query, ...params);
  res.json(await enrichMoviesBatch(movies, { group: req.group }));
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
  const groupId = req.group?.id || 1;

  let user = await db.get('SELECT id FROM users WHERE display_name = ? OR username = ?', voter, voter);
  const userId = user ? user.id : req.session.userId;

  if (!userId) return res.status(400).json({ error: 'User not found' });

  const exists = await db.get(
    'SELECT 1 FROM group_watchlist_votes WHERE group_id = ? AND movie_id = ? AND user_id = ?',
    groupId, id, userId
  );

  if (exists) {
    await db.run(
      'DELETE FROM group_watchlist_votes WHERE group_id = ? AND movie_id = ? AND user_id = ?',
      groupId, id, userId
    );
    if (groupId === 1) {
      await db.run('DELETE FROM watchlist_votes WHERE movie_id = ? AND voter = ?', id, voter);
    }
  } else {
    if (sessionVoter !== 'mnAdmin') {
      const { c: count } = await db.get(
        'SELECT COUNT(*) as c FROM group_watchlist_votes WHERE group_id = ? AND user_id = ?',
        groupId, userId
      );
      if (count >= 3) return res.status(400).json({ error: 'vote_limit' });
    }
    await db.run(
      'INSERT INTO group_watchlist_votes (group_id, movie_id, user_id) VALUES (?, ?, ?)',
      groupId, id, userId
    );
    if (groupId === 1) {
      await db.run('INSERT OR IGNORE INTO watchlist_votes (movie_id, voter) VALUES (?, ?)', id, voter);
    }
  }
  res.json({ ok: true });
}));

// GET /api/movies/directors  — must be before /:id
router.get('/directors', ah(async (_req, res) => {
  const rows = await db.all("SELECT DISTINCT director FROM movies WHERE director != '' ORDER BY director COLLATE NOCASE");
  res.json(rows.map(r => r.director));
}));

// GET /api/movies/top10-counts  — { voter: number of top picks }. Must be before /:id.
router.get('/top10-counts', ah(async (req, res) => {
  const rows = await db.all('SELECT voter, COUNT(*) AS n FROM top3 GROUP BY voter');
  const counts = {};
  const voterList = req.group?.voters || VOTERS;
  for (const v of voterList) counts[v] = 0;
  for (const r of rows) {
    if (voterList.includes(r.voter)) counts[r.voter] = r.n;
  }
  res.json(counts);
}));

// GET /api/movies/top10/:voter  — voter's current Top 10 in rank order. Must be before /:id.
router.get('/top10/:voter', ah(async (req, res) => {
  const { voter } = req.params;
  const user = await db.get('SELECT id FROM users WHERE display_name = ? OR username = ?', voter, voter);
  if (!VOTERS.includes(voter) && !user) return res.status(404).json({ error: 'Voter not found' });
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
  const allVoterRows = await db.all('SELECT display_name FROM users');
  const allKnownVoters = new Set([...VOTERS, ...allVoterRows.map(u => u.display_name)]);
  if (!order || !allKnownVoters.has(voter)) return res.status(400).json({ error: 'Bad request' });
  const ids = order.map(Number).filter(Boolean).slice(0, 10);

  // Snapshot before the rewrite so the trail can record what actually moved.
  const rowsBefore = await db.all('SELECT movie_id, rank FROM top3 WHERE voter = ?', voter);
  const ranksBefore = new Map(rowsBefore.map(r => [r.movie_id, r.rank]));

  const u = await db.get('SELECT id FROM users WHERE display_name = ? OR username = ?', voter, voter);
  const userId = u ? u.id : req.session.userId;

  await db.transaction(async (tx) => {
    await tx.run('DELETE FROM top3 WHERE voter = ?', voter);
    for (let i = 0; i < ids.length; i++) {
      await tx.run('INSERT INTO top3 (movie_id, voter, rank, user_id) VALUES (?, ?, ?, ?)', ids[i], voter, i + 1, userId);
    }
  });

  // Diff positions
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
  const isSiteAdmin = req.session.isAdmin || req.session.voter === 'mnAdmin';
  const isGroupAdmin = req.group?.members?.some(m => m.id === req.session.userId && m.role === 'admin');
  if (!isSiteAdmin && !isGroupAdmin) return res.status(403).json({ error: 'Admin only' });
  const mode = req.body?.mode;
  if (mode !== 'votes' && mode !== 'all') return res.status(400).json({ error: 'mode must be "votes" or "all"' });

  const groupId = req.group?.id || 1;

  if (SANDBOX_MODE) {
    const result = await db.transaction(async (tx) => {
      const { changes: votes } = await tx.run('DELETE FROM watchlist_votes');
      let cleared = 0;
      if (mode === 'all') {
        await tx.run(`
          INSERT INTO sandbox_watchlist_overrides (movie_id, watchlist)
          SELECT id, 0 FROM movies WHERE watchlist = 1
          ON CONFLICT(movie_id) DO UPDATE SET watchlist = 0
        `);
        const res = await tx.run('UPDATE sandbox_watchlist_overrides SET watchlist = 0');
        cleared = res.changes;
      }
      return { votesCleared: votes, filmsCleared: cleared };
    });
    return res.json(result);
  }

  const result = await db.transaction(async (tx) => {
    const { changes: votes } = await tx.run('DELETE FROM group_watchlist_votes WHERE group_id = ?', groupId);
    let cleared = 0;
    if (mode === 'all') {
      const res = await tx.run('UPDATE group_movie_status SET watchlist = 0 WHERE group_id = ? AND watchlist = 1', groupId);
      cleared = res.changes;
      if (groupId === 1) {
        await tx.run('UPDATE movies SET watchlist = 0 WHERE watchlist = 1');
        await tx.run('DELETE FROM watchlist_votes');
      }
    } else if (groupId === 1) {
      await tx.run('DELETE FROM watchlist_votes');
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
  if (SANDBOX_MODE) {
    return res.status(403).json({ error: 'Backfilling runtimes is disabled in sandbox mode.' });
  }
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
  res.json(await enrichMovie(movie, { group: req.group }));
}));

// POST /api/movies
router.post('/', ah(async (req, res) => {
  const { director = '', title, year = '', mn = false, watchlist = false, imdb_id } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: 'title is required' });

  const targetTable = SANDBOX_MODE ? 'sandbox_movies' : 'movies';
  const { lastInsertRowid } = await db.run(`
    INSERT INTO ${targetTable} (director, title, year, mn, watchlist)
    VALUES (?, ?, ?, ?, ?)
  `, director.trim(), title.trim(), year.trim(), mn ? 1 : 0, watchlist ? 1 : 0);

  const groupId = req.group?.id || 1;
  if (mn || watchlist) {
    try {
      await db.run(
        'INSERT OR REPLACE INTO group_movie_status (group_id, movie_id, mn, watchlist) VALUES (?, ?, ?, ?)',
        groupId, lastInsertRowid, mn ? 1 : 0, watchlist ? 1 : 0
      );
    } catch (_) {}
  }

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
      await db.run(`UPDATE ${targetTable} SET imdb_id = ?, imdb_rating = ?, letterboxd_rating = ?, poster_path = ?, runtime = ? WHERE id = ?`,
        imdb?.imdbId ?? null, imdb?.imdbRating ?? null, letterboxdRating ?? null, posterPath ?? null, runtime ?? null, lastInsertRowid);
    }
  } catch (_) { /* film is still added even if metadata lookup is unavailable */ }

  res.status(201).json(await enrichMovie(
    await db.get('SELECT * FROM movies WHERE id = ?', lastInsertRowid),
    { group: req.group }
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
  const isSandboxMovie = SANDBOX_MODE && (id >= 1000000);

  if (SANDBOX_MODE && !isSandboxMovie) {
    // In sandbox mode for shared live movies: catalog metadata is immutable.
    // Watchlist additions/removals are isolated into sandbox_watchlist_overrides.
    if (watchlist !== undefined) {
      const nextWl = watchlist ? 1 : 0;
      await db.run(`
        INSERT INTO sandbox_watchlist_overrides (movie_id, watchlist)
        VALUES (?, ?)
        ON CONFLICT(movie_id) DO UPDATE SET watchlist = excluded.watchlist
      `, id, nextWl);
      if (nextWl === 0) {
        await db.run('DELETE FROM watchlist_votes WHERE movie_id = ?', id);
      }
    }
  } else {
    // Shared live mode OR sandbox film (id >= 1,000,000):
    const targetTable = isSandboxMovie ? 'sandbox_movies' : 'movies';
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
      await db.run(`UPDATE ${targetTable} SET ${setClause} WHERE id = ?`, ...Object.values(updates), id);
    }

    const groupId = req.group?.id || 1;
    if (mn !== undefined || watchlist !== undefined) {
      const nextMn = mn !== undefined ? (mn ? 1 : 0) : null;
      const nextWl = watchlist !== undefined ? (watchlist ? 1 : 0) : null;
      await db.run(`
        INSERT INTO group_movie_status (group_id, movie_id, mn, watchlist)
        VALUES (?, ?, COALESCE(?, 0), COALESCE(?, 0))
        ON CONFLICT(group_id, movie_id) DO UPDATE SET
          mn = CASE WHEN ? IS NOT NULL THEN ? ELSE group_movie_status.mn END,
          watchlist = CASE WHEN ? IS NOT NULL THEN ? ELSE group_movie_status.watchlist END
      `, groupId, id, nextMn, nextWl, nextMn, nextMn, nextWl, nextWl);

      if (watchlist === false) {
        await db.run('DELETE FROM group_watchlist_votes WHERE group_id = ? AND movie_id = ?', groupId, id);
      }
    }

    // Leaving the watchlist discards the film's votes — a film re-added later starts fresh.
    if (watchlist !== undefined && !watchlist && movie.watchlist) {
      await db.run('DELETE FROM watchlist_votes WHERE movie_id = ?', id);
    }
  }

  if (ratings) {
    const activeVoters = req.group?.voters || VOTERS;
    const votersToRate = (isAdmin || activeVoters.includes(sessionVoter)) ? activeVoters : [sessionVoter];
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
            const u = await tx.get('SELECT id FROM users WHERE display_name = ? OR username = ?', voter, voter);
            const uid = u ? u.id : (voter === sessionVoter ? req.session.userId : null);
            await tx.run(`
              INSERT INTO ratings (movie_id, voter, score, user_id) VALUES (?, ?, ?, ?)
              ON CONFLICT(movie_id, voter) DO UPDATE SET score = excluded.score, user_id = COALESCE(excluded.user_id, ratings.user_id)
            `, id, voter, score, uid);
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
    const activeVoters = req.group?.voters || VOTERS;
    const votersToComment = (isAdmin || activeVoters.includes(sessionVoter)) ? activeVoters : [sessionVoter];
    for (const voter of votersToComment) {
      if (voter in comments) {
        if (!isAdmin && voter !== sessionVoter) continue;
        await db.run('UPDATE ratings SET comment = ? WHERE movie_id = ? AND voter = ?', comments[voter] || '', id, voter);
      }
    }
  }

  if (top3) {
    const activeVoters = req.group?.voters || VOTERS;
    const movieIdNum = Number(id);
    const touched = new Set();

    // Snapshot each affected voter's whole Top 10 before anything moves: the
    // renumber/eviction step below can change the rank of films other than
    // this one, and those movements belong in the history too.
    const ranksBefore = new Map();
    for (const voter of activeVoters) {
      if (!(voter in top3)) continue;
      if (!isAdmin && voter !== sessionVoter) continue;
      const rows = await db.all('SELECT movie_id, rank FROM top3 WHERE voter = ?', voter);
      ranksBefore.set(voter, new Map(rows.map(r => [r.movie_id, r.rank])));
      touched.add(voter);
    }

    for (const voter of touched) {
      const raw = top3[voter];
      const targetRank = (raw != null && raw !== '') ? parseInt(raw, 10) : null;

      const u = await db.get('SELECT id FROM users WHERE display_name = ? OR username = ?', voter, voter);
      const uid = u ? u.id : (voter === sessionVoter ? req.session.userId : null);

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
          await tx.run('INSERT INTO top3 (movie_id, voter, rank, user_id) VALUES (?, ?, ?, ?)', finalIds[i], voter, i + 1, uid);
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

  res.json(await enrichMovie(await db.get('SELECT * FROM movies WHERE id = ?', id), { group: req.group }));
}));

// DELETE /api/movies/:id
router.delete('/:id', ah(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (SANDBOX_MODE) {
    if (id < 1000000) {
      return res.status(403).json({ error: 'Deleting live movies is disabled in sandbox mode.' });
    }
    await db.transaction(async tx => {
      await tx.run('DELETE FROM sandbox_ratings WHERE movie_id = ?', id);
      await tx.run('DELETE FROM sandbox_top3 WHERE movie_id = ?', id);
      await tx.run('DELETE FROM sandbox_watchlist_votes WHERE movie_id = ?', id);
      await tx.run('DELETE FROM sandbox_watchlist_overrides WHERE movie_id = ?', id);
      await tx.run('DELETE FROM sandbox_rating_history WHERE movie_id = ?', id);
      await tx.run('DELETE FROM sandbox_list_items WHERE movie_id = ?', id);
      await tx.run('DELETE FROM sandbox_movies WHERE id = ?', id);
    });
    return res.status(204).end();
  }
  const result = await db.run('DELETE FROM movies WHERE id = ?', id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.status(204).end();
}));

module.exports = router;
