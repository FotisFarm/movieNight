// Turns raw `movies` rows into the shape every client-facing route returns:
// the per-voter ratings/comments/top-10 maps plus every derived score
// variant. Supports multi-group scoping: scores, watchlist status, and MN
// status are isolated to the active group, while exposing other groups'
// ratings for cross-group discovery and network scores.
const db = require('./db');
const { rankBonus } = require('./scoring');
const { VOTERS, GROUP_SIZE } = require('./config');

function resolveGroupParams(options = {}) {
  const group = options.group;
  const groupId = group?.id || (typeof options.groupId === 'number' ? options.groupId : 1);
  const voters = (group?.voters && group.voters.length > 0)
    ? group.voters
    : (Array.isArray(options.voters) && options.voters.length > 0 ? options.voters : VOTERS);
  const groupSize = group?.groupSize || (typeof options.groupSize === 'number' ? options.groupSize : voters.length) || GROUP_SIZE;
  return { groupId, voters, groupSize };
}

async function enrichMovie(movie, options = {}) {
  const { groupId, voters, groupSize } = resolveGroupParams(options);

  const [ratings, top3, groupStatusRow, groupWlRows, legacyWlRows] = await Promise.all([
    db.all('SELECT voter, score, comment FROM ratings WHERE movie_id = ?', movie.id),
    db.all('SELECT voter, rank FROM top3 WHERE movie_id = ?', movie.id),
    db.get('SELECT mn, watchlist FROM group_movie_status WHERE group_id = ? AND movie_id = ?', groupId, movie.id),
    db.all(`
      SELECT u.display_name AS voter
      FROM group_watchlist_votes gwv
      JOIN users u ON u.id = gwv.user_id
      WHERE gwv.group_id = ? AND gwv.movie_id = ?
    `, groupId, movie.id),
    groupId === 1 ? db.all('SELECT voter FROM watchlist_votes WHERE movie_id = ?', movie.id) : Promise.resolve([]),
  ]);

  const groupVotes = groupWlRows.map(r => r.voter);
  const watchlistVotes = (groupVotes.length > 0 || groupId !== 1)
    ? groupVotes
    : legacyWlRows.map(r => r.voter);

  const isMn = groupStatusRow ? groupStatusRow.mn === 1 : (groupId === 1 ? movie.mn === 1 : false);
  const isWatchlist = groupStatusRow ? groupStatusRow.watchlist === 1 : (groupId === 1 ? movie.watchlist === 1 : false);

  const ratingsMap = {};
  const commentsMap = {};
  const otherRatings = {};
  const allScores = [];

  for (const r of ratings) {
    if (r.score != null) allScores.push(r.score);
    if (voters.includes(r.voter)) {
      ratingsMap[r.voter] = r.score;
      if (r.comment) commentsMap[r.voter] = r.comment;
    } else {
      const t = top3.find(x => x.voter === r.voter);
      otherRatings[r.voter] = {
        score: r.score,
        comment: r.comment || '',
        rank: t ? t.rank : null,
      };
    }
  }

  const top3Map = {};
  for (const t of top3) {
    if (voters.includes(t.voter)) {
      top3Map[t.voter] = t.rank;
    }
  }

  const scores = voters.map(v => ratingsMap[v]).filter(s => s != null);
  const n = scores.length;
  let score = null, fairScore = null, boostedScore = null, fairBoosted = null;

  const boost = voters.map(v => top3Map[v]).filter(r => r != null).reduce((acc, rank) => acc + rankBonus(rank), 0);

  let stdDev = null;
  if (n > 0) {
    const sum = scores.reduce((a, b) => a + b, 0);
    score = Math.round((sum / groupSize) * 100) / 100;
    fairScore = Math.round((sum / n) * 100) / 100;
    boostedScore = Math.round(Math.min(10, score + boost) * 100) / 100;
    fairBoosted = Math.round(Math.min(10, fairScore + boost) * 100) / 100;
    if (n >= 2) {
      const mean = sum / n;
      stdDev = Math.round(Math.sqrt(scores.reduce((acc, s) => acc + (s - mean) ** 2, 0) / n) * 100) / 100;
    }
  }

  const networkVoterCount = allScores.length;
  const networkScore = networkVoterCount > 0
    ? Math.round((allScores.reduce((a, b) => a + b, 0) / networkVoterCount) * 100) / 100
    : null;

  return {
    ...movie,
    mn: isMn,
    watchlist: isWatchlist,
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
    otherRatings,
    networkScore,
    networkVoterCount,
    groupId,
  };
}

async function enrichMoviesBatch(movies, options = {}) {
  if (!movies.length) return [];
  const { groupId, voters, groupSize } = resolveGroupParams(options);
  const ids = movies.map(m => m.id);
  const placeholders = ids.map(() => '?').join(',');

  const [ratingsRows, top3Rows, groupStatusRows, groupWlRows, legacyWlRows] = await Promise.all([
    db.all(`SELECT movie_id, voter, score, comment FROM ratings WHERE movie_id IN (${placeholders})`, ...ids),
    db.all(`SELECT movie_id, voter, rank FROM top3 WHERE movie_id IN (${placeholders})`, ...ids),
    db.all(`SELECT movie_id, mn, watchlist FROM group_movie_status WHERE group_id = ? AND movie_id IN (${placeholders})`, groupId, ...ids),
    db.all(`
      SELECT gwv.movie_id, u.display_name AS voter
      FROM group_watchlist_votes gwv
      JOIN users u ON u.id = gwv.user_id
      WHERE gwv.group_id = ? AND gwv.movie_id IN (${placeholders})
    `, groupId, ...ids),
    groupId === 1 ? db.all(`SELECT movie_id, voter FROM watchlist_votes WHERE movie_id IN (${placeholders})`, ...ids) : Promise.resolve([]),
  ]);

  // Build lookup maps
  const ratingsMap = {};
  const commentsMap = {};
  const otherRatingsMap = {};
  const allScoresMap = {};

  for (const r of ratingsRows) {
    (allScoresMap[r.movie_id] ||= []).push(r.score);
    if (voters.includes(r.voter)) {
      if (!ratingsMap[r.movie_id]) ratingsMap[r.movie_id] = {};
      if (!commentsMap[r.movie_id]) commentsMap[r.movie_id] = {};
      ratingsMap[r.movie_id][r.voter] = r.score;
      if (r.comment) commentsMap[r.movie_id][r.voter] = r.comment;
    } else {
      if (!otherRatingsMap[r.movie_id]) otherRatingsMap[r.movie_id] = {};
      otherRatingsMap[r.movie_id][r.voter] = {
        score: r.score,
        comment: r.comment || '',
        rank: null,
      };
    }
  }

  const top3Map = {};
  for (const t of top3Rows) {
    if (voters.includes(t.voter)) {
      if (!top3Map[t.movie_id]) top3Map[t.movie_id] = {};
      top3Map[t.movie_id][t.voter] = t.rank;
    } else if (otherRatingsMap[t.movie_id]?.[t.voter]) {
      otherRatingsMap[t.movie_id][t.voter].rank = t.rank;
    }
  }

  const statusMap = {};
  for (const s of groupStatusRows) {
    statusMap[s.movie_id] = s;
  }

  const wlMap = {};
  for (const w of groupWlRows) {
    (wlMap[w.movie_id] ||= []).push(w.voter);
  }
  if (groupId === 1) {
    for (const w of legacyWlRows) {
      if (!wlMap[w.movie_id]) {
        (wlMap[w.movie_id] ||= []).push(w.voter);
      }
    }
  }

  return movies.map(movie => {
    const ratings = ratingsMap[movie.id] || {};
    const comments = commentsMap[movie.id] || {};
    const top3 = top3Map[movie.id] || {};
    const otherRatings = otherRatingsMap[movie.id] || {};
    const watchlistVotes = wlMap[movie.id] || [];

    const st = statusMap[movie.id];
    const mn = st ? st.mn === 1 : (groupId === 1 ? movie.mn === 1 : false);
    const watchlist = st ? st.watchlist === 1 : (groupId === 1 ? movie.watchlist === 1 : false);

    const scores = voters.map(v => ratings[v]).filter(s => s != null);
    const n = scores.length;
    let score = null, fairScore = null, boostedScore = null, fairBoosted = null;

    const boost = voters.map(v => top3[v]).filter(r => r != null).reduce((acc, rank) => acc + rankBonus(rank), 0);

    let stdDev = null;
    if (n > 0) {
      const sum = scores.reduce((a, b) => a + b, 0);
      score = Math.round((sum / groupSize) * 100) / 100;
      fairScore = Math.round((sum / n) * 100) / 100;
      boostedScore = Math.round(Math.min(10, score + boost) * 100) / 100;
      fairBoosted = Math.round(Math.min(10, fairScore + boost) * 100) / 100;
      if (n >= 2) {
        const mean = sum / n;
        stdDev = Math.round(Math.sqrt(scores.reduce((acc, s) => acc + (s - mean) ** 2, 0) / n) * 100) / 100;
      }
    }

    const allScores = allScoresMap[movie.id] || [];
    const networkVoterCount = allScores.length;
    const networkScore = networkVoterCount > 0
      ? Math.round((allScores.reduce((a, b) => a + b, 0) / networkVoterCount) * 100) / 100
      : null;

    return {
      ...movie,
      mn,
      watchlist,
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
      otherRatings,
      networkScore,
      networkVoterCount,
      groupId,
    };
  });
}

module.exports = { enrichMovie, enrichMoviesBatch };
