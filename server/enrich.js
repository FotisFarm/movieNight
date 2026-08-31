// Turns raw `movies` rows into the shape every client-facing route returns:
// the per-voter ratings/comments/top-10 maps plus every derived score
// variant. Lives here rather than in routes/movies.js so other routes (the
// custom lists route, for one) can reuse it without importing a router.
const db = require('./db');
const { rankBonus } = require('./scoring');
const { VOTERS, GROUP_SIZE } = require('./config');

async function enrichMovie(movie) {
  // These three are independent — issued concurrently so the whole enrichment
  // costs one network round trip instead of three. libSQL is remote, so
  // sequential awaits here meant 3x the latency for no reason.
  const [ratings, top3, wlRows] = await Promise.all([
    db.all('SELECT voter, score, comment FROM ratings WHERE movie_id = ?', movie.id),
    db.all('SELECT voter, rank FROM top3 WHERE movie_id = ?', movie.id),
    db.all('SELECT voter FROM watchlist_votes WHERE movie_id = ?', movie.id),
  ]);
  const watchlistVotes = wlRows.map(r => r.voter);

  const ratingsMap = {};
  const commentsMap = {};
  for (const r of ratings) {
    ratingsMap[r.voter] = r.score;
    if (r.comment) commentsMap[r.voter] = r.comment;
  }

  const top3Map = {};
  for (const t of top3) top3Map[t.voter] = t.rank;

  const scores = VOTERS.map(v => ratingsMap[v]).filter(s => s != null);
  const n = scores.length;
  let score = null, fairScore = null, boostedScore = null, fairBoosted = null;

  const boost = VOTERS.map(v => top3Map[v]).filter(r => r != null).reduce((acc, rank) => acc + rankBonus(rank), 0);

  let stdDev = null;
  if (n > 0) {
    const sum = scores.reduce((a, b) => a + b, 0);
    score = Math.round((sum / GROUP_SIZE) * 100) / 100;
    fairScore = Math.round((sum / n) * 100) / 100;
    boostedScore = Math.round(Math.min(10, score + boost) * 100) / 100;
    fairBoosted = Math.round(Math.min(10, fairScore + boost) * 100) / 100;
    if (n >= 2) {
      const mean = sum / n;
      stdDev = Math.round(Math.sqrt(scores.reduce((acc, s) => acc + (s - mean) ** 2, 0) / n) * 100) / 100;
    }
  }

  return {
    ...movie,
    mn: movie.mn === 1,
    watchlist: movie.watchlist === 1,
    ratings: ratingsMap,
    comments: commentsMap,
    top3: top3Map,
    watchlistVotes,
    voterCount: n,
    boost,
    score,
    fairScore,
    boostedScore,
    fairBoosted,
    stdDev,
  };
}

async function enrichMoviesBatch(movies) {
  if (!movies.length) return [];
  const ids = movies.map(m => m.id);
  const placeholders = ids.map(() => '?').join(',');

  // Same reasoning as enrichMovie: independent queries, one round trip.
  const [ratingsRows, top3Rows, wlRows] = await Promise.all([
    db.all(`SELECT movie_id, voter, score, comment FROM ratings WHERE movie_id IN (${placeholders})`, ...ids),
    db.all(`SELECT movie_id, voter, rank FROM top3 WHERE movie_id IN (${placeholders})`, ...ids),
    db.all(`SELECT movie_id, voter FROM watchlist_votes WHERE movie_id IN (${placeholders})`, ...ids),
  ]);

  // Build lookup maps
  const ratingsMap = {};
  const commentsMap = {};
  for (const r of ratingsRows) {
    if (!ratingsMap[r.movie_id]) ratingsMap[r.movie_id] = {};
    if (!commentsMap[r.movie_id]) commentsMap[r.movie_id] = {};
    ratingsMap[r.movie_id][r.voter] = r.score;
    if (r.comment) commentsMap[r.movie_id][r.voter] = r.comment;
  }

  const top3Map = {};
  for (const t of top3Rows) {
    if (!top3Map[t.movie_id]) top3Map[t.movie_id] = {};
    top3Map[t.movie_id][t.voter] = t.rank;
  }

  const wlMap = {};
  for (const w of wlRows) {
    if (!wlMap[w.movie_id]) wlMap[w.movie_id] = [];
    wlMap[w.movie_id].push(w.voter);
  }

  return movies.map(movie => {
    const ratings = ratingsMap[movie.id] || {};
    const comments = commentsMap[movie.id] || {};
    const top3 = top3Map[movie.id] || {};
    const watchlistVotes = wlMap[movie.id] || [];

    const scores = VOTERS.map(v => ratings[v]).filter(s => s != null);
    const n = scores.length;
    let score = null, fairScore = null, boostedScore = null, fairBoosted = null;

    const boost = VOTERS.map(v => top3[v]).filter(r => r != null).reduce((acc, rank) => acc + rankBonus(rank), 0);

    let stdDev = null;
    if (n > 0) {
      const sum = scores.reduce((a, b) => a + b, 0);
      score = Math.round((sum / GROUP_SIZE) * 100) / 100;
      fairScore = Math.round((sum / n) * 100) / 100;
      boostedScore = Math.round(Math.min(10, score + boost) * 100) / 100;
      fairBoosted = Math.round(Math.min(10, fairScore + boost) * 100) / 100;
      if (n >= 2) {
        const mean = sum / n;
        stdDev = Math.round(Math.sqrt(scores.reduce((acc, s) => acc + (s - mean) ** 2, 0) / n) * 100) / 100;
      }
    }

    return {
      ...movie,
      mn: movie.mn === 1,
      watchlist: movie.watchlist === 1,
      ratings,
      comments,
      top3,
      watchlistVotes,
      voterCount: n,
      boost,
      score,
      fairScore,
      boostedScore,
      fairBoosted,
      stdDev,
    };
  });
}

module.exports = { enrichMovie, enrichMoviesBatch };
