const express = require('express');
const db = require('../db');
const { rankBonus } = require('../scoring');
const { lookupImdb, searchImdb, getImdbById, extractImdbId } = require('../omdb');
const { findByImdbId, lookupPosterPath } = require('../tmdb');
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

// PUT /api/movies/top10  — rewrite the session voter's own top picks (ranks 1..N) in order.
// Must be before /:id. Permission is implicit: it only ever touches req.session.voter's rows.
router.put('/top10', ah(async (req, res) => {
  const sessionVoter = req.session.voter;
  const isAdmin = sessionVoter === 'mnAdmin';
  // Admins may target any voter; everyone else can only rewrite their own.
  const voter = isAdmin && req.body.voter ? req.body.voter : sessionVoter;
  const order = Array.isArray(req.body.order) ? req.body.order : null;
  if (!order || !VOTERS.includes(voter)) return res.status(400).json({ error: 'Bad request' });
  const ids = order.map(Number).filter(Boolean).slice(0, 10);
  await db.transaction(async (tx) => {
    await tx.run('DELETE FROM top3 WHERE voter = ?', voter);
    for (let i = 0; i < ids.length; i++) {
      await tx.run('INSERT INTO top3 (movie_id, voter, rank) VALUES (?, ?, ?)', ids[i], voter, i + 1);
    }
  });
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
    if (imdb?.imdbId) {
      await db.run('UPDATE movies SET imdb_id = ?, imdb_rating = ? WHERE id = ?',
        imdb.imdbId, imdb.imdbRating ?? null, lastInsertRowid);
    }
    // Poster comes from TMDB, keyed off whichever IMDb id we settled on; falls
    // back to a title search when there is none. Separate try/catch so a TMDB
    // outage can't cost us the IMDb data we just wrote.
    try {
      const posterPath = await lookupPosterPath(imdb?.imdbId, title.trim(), year.trim());
      if (posterPath) {
        await db.run('UPDATE movies SET poster_path = ? WHERE id = ?', posterPath, lastInsertRowid);
      }
    } catch (_) { /* no poster is not a failure */ }
  } catch (_) { /* film is still added even if OMDb is unavailable */ }

  res.status(201).json(await enrichMovie(
    await db.get('SELECT * FROM movies WHERE id = ?', lastInsertRowid)
  ));
}));

// PATCH /api/movies/:id
router.patch('/:id', ah(async (req, res) => {
  const id = parseInt(req.params.id);
  const movie = await db.get('SELECT * FROM movies WHERE id = ?', id);
  if (!movie) return res.status(404).json({ error: 'Not found' });

  const { director, title, year, mn, watchlist, cinobo, imdb_id, ratings, comments, top3 } = req.body;
  const sessionVoter = req.session.voter;
  const isAdmin = sessionVoter === 'mnAdmin';

  const updates = {};
  if (director !== undefined) updates.director = director;
  if (title !== undefined)    updates.title = title;
  if (year !== undefined)     updates.year = year;
  if (mn !== undefined)       updates.mn = mn ? 1 : 0;
  if (watchlist !== undefined) updates.watchlist = watchlist ? 1 : 0;
  if (cinobo !== undefined)   updates.cinobo = cinobo;
  // Setting/changing the IMDb id re-fetches the rating; clearing it wipes both.
  if (imdb_id !== undefined) {
    // The client may paste a full IMDb URL — store the extracted id, never the raw string.
    const cleanId = extractImdbId(imdb_id);
    if (!cleanId) {
      updates.imdb_id = null;
      updates.imdb_rating = null;
      // The poster was resolved from that id, so it goes too.
      updates.poster_path = null;
    } else {
      updates.imdb_id = cleanId;
      const detail = await getImdbById(cleanId);
      updates.imdb_rating = detail?.imdbRating ?? null;
      // Re-point the poster at the film the new id actually names. A TMDB
      // miss clears it rather than leaving the previous film's artwork.
      try {
        const found = await findByImdbId(cleanId);
        updates.poster_path = found?.posterPath ?? null;
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
    for (const voter of votersToRate) {
      if (voter in ratings) {
        if (!isAdmin && voter !== sessionVoter) continue;
        const score = ratings[voter];
        if (score === null || score === '') {
          await db.run('DELETE FROM ratings WHERE movie_id = ? AND voter = ?', id, voter);
        } else {
          await db.run(`
            INSERT INTO ratings (movie_id, voter, score) VALUES (?, ?, ?)
            ON CONFLICT(movie_id, voter) DO UPDATE SET score = excluded.score
          `, id, voter, parseFloat(score));
        }
      }
    }
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
    const touched = new Set();

    for (const voter of VOTERS) {
      if (voter in top3) {
        if (!isAdmin && voter !== sessionVoter) continue;
        const rankNum = parseInt(top3[voter]);
        if (!rankNum) {
          await db.run('DELETE FROM top3 WHERE movie_id = ? AND voter = ?', id, voter);
        } else if (rankNum >= 1 && rankNum <= 10) {
          await db.run(`
            INSERT INTO top3 (movie_id, voter, rank) VALUES (?, ?, ?)
            ON CONFLICT(movie_id, voter) DO UPDATE SET rank = excluded.rank
          `, id, voter, rankNum);
        }
        touched.add(voter);
      }
    }

    // Re-normalise each touched voter's picks to contiguous ranks 1..N — closes the gap a removal leaves.
    // If a voter now has more than 10 picks (this movie pushed them over), evict their lowest-priority
    // *other* pick(s) rather than letting the rank CHECK constraint fail — the film just touched always survives.
    for (const v of touched) {
      await db.transaction(async (tx) => {
        let rows = await tx.all('SELECT id, movie_id, rank FROM top3 WHERE voter = ? ORDER BY rank, id', v);
        if (rows.length > 10) {
          const touchedIdx = rows.findIndex(r => r.movie_id === id);
          const touchedRow = touchedIdx >= 0 ? rows[touchedIdx] : null;
          const others = touchedRow ? rows.filter((_, i) => i !== touchedIdx) : rows;
          const keepCount = touchedRow ? 9 : 10;
          const evicted = others.slice(keepCount);
          for (const e of evicted) {
            await tx.run('DELETE FROM top3 WHERE id = ?', e.id);
          }
          rows = touchedRow ? [touchedRow, ...others.slice(0, keepCount)] : others.slice(0, keepCount);
          rows.sort((a, b) => a.rank - b.rank || a.id - b.id);
        }
        for (let i = 0; i < rows.length; i++) {
          await tx.run('UPDATE top3 SET rank = ? WHERE id = ?', i + 1, rows[i].id);
        }
      });
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
