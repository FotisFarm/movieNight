// Reconstructs rating_history from the daily snapshots on the `backups` branch.
//
// The nightly workflow has committed one snapshot per day since 2026-06-16, and
// the 7-day pruning window only removes files from the branch *tip* — every
// historical commit still holds that day's dump. Diffing consecutive days
// recovers when each score and Top 10 position actually changed, which is the
// only record of the group's history that exists: the `ratings` table itself
// has never carried a timestamp.
//
//   node server/scripts/backfill-rating-history.js --dry-run
//   node server/scripts/backfill-rating-history.js --apply
//
// Flags:
//   --dry-run        parse and diff, print a summary, write nothing (default)
//   --apply          write the reconstructed rows
//   --force          delete existing source='backfill' rows first and redo them
//   --limit=N        only walk the N oldest snapshots (for a fast trial run)
//   --branch=NAME    snapshot branch to read (default: origin/backups, else backups)
//
// Two honesty rules the output has to respect:
//   1. Granularity is one day. Three revisions in one afternoon collapse to one.
//   2. Attribution is unknowable — the dumps record values, not who typed them.
//      Every row written here gets source='backfill' and an empty changed_by.

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createClient } = require('@libsql/client');
const db = require('../db');

const args = process.argv.slice(2);
const hasFlag = (name) => args.includes(`--${name}`);
const flagValue = (name) => {
  const hit = args.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

const APPLY = hasFlag('apply');
const FORCE = hasFlag('force');
const LIMIT = flagValue('limit') ? parseInt(flagValue('limit'), 10) : null;

/** Runs a git command in the repo root and returns stdout (string or buffer). */
function git(gitArgs, encoding = 'utf8') {
  return execFileSync('git', gitArgs, {
    cwd: path.join(__dirname, '..', '..'),
    encoding,
    maxBuffer: 256 * 1024 * 1024,
    // The snapshot probe below expects misses, and git writes them to stderr.
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

/** Picks the snapshot branch that exists, preferring the remote-tracking one. */
function resolveBranch() {
  const explicit = flagValue('branch');
  const candidates = explicit ? [explicit] : ['origin/backups', 'backups'];
  for (const candidate of candidates) {
    try {
      git(['rev-parse', '--verify', `${candidate}^{commit}`]);
      return candidate;
    } catch (_) { /* try the next one */ }
  }
  throw new Error(`No snapshot branch found (tried ${candidates.join(', ')})`);
}

/** Lists one snapshot per date, oldest first, as { date, commit, file }. */
function listSnapshots(branch) {
  const log = git(['log', '--format=%H %ad', '--date=short', branch]).trim().split('\n');
  const byDate = new Map();
  for (const line of log) {
    const [commit, date] = line.split(' ');
    // Several commits can share a date (the migration day had three); the last
    // one written for that date is the one whose tree we want, and git log is
    // newest-first, so the first match wins.
    if (byDate.has(date)) continue;
    for (const file of [`movies_${date}.sql`, `movies_${date}.db`]) {
      try {
        git(['cat-file', '-e', `${commit}:${file}`]);
        byDate.set(date, { date, commit, file });
        break;
      } catch (_) { /* not this extension */ }
    }
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Splits a SQL VALUES tuple into JS values, honouring '' escapes inside strings. */
function splitValues(text) {
  const values = [];
  let index = 0;
  while (index < text.length) {
    while (text[index] === ' ' || text[index] === ',') index++;
    if (index >= text.length) break;
    if (text[index] === "'") {
      let value = '';
      index++;
      while (index < text.length) {
        if (text[index] === "'" && text[index + 1] === "'") { value += "'"; index += 2; continue; }
        if (text[index] === "'") { index++; break; }
        value += text[index++];
      }
      values.push(value);
    } else {
      let value = '';
      while (index < text.length && text[index] !== ',') value += text[index++];
      value = value.trim();
      values.push(value === 'NULL' ? null : Number(value));
    }
  }
  return values;
}

const INSERT_LINE = /^INSERT INTO (\w+) \(([^)]+)\) VALUES \((.*)\);$/;

/** Reads a .sql dump into { scores, ranks } maps keyed by `movieId|voter`. */
function readSqlDump(text) {
  const scores = new Map();
  const ranks = new Map();
  const titles = new Map();
  for (const line of text.split('\n')) {
    const match = INSERT_LINE.exec(line.trim());
    if (!match) continue;
    const [, table, columnList, valueList] = match;
    if (table === 'movies') {
      const columns = columnList.split(',').map(c => c.trim());
      const values = splitValues(valueList);
      const row = Object.fromEntries(columns.map((c, i) => [c, values[i]]));
      titles.set(Number(row.id), row.title);
      continue;
    }
    if (table !== 'ratings' && table !== 'top3') continue;
    const columns = columnList.split(',').map(c => c.trim());
    const values = splitValues(valueList);
    const row = Object.fromEntries(columns.map((c, i) => [c, values[i]]));
    const key = `${row.movie_id}|${row.voter}`;
    if (table === 'ratings') scores.set(key, row.score);
    else ranks.set(key, row.rank);
  }
  return { scores, ranks, titles };
}

/** Reads a pre-Turso binary .db snapshot via a throwaway local libSQL client. */
async function readDbSnapshot(buffer) {
  const tempPath = path.join(os.tmpdir(), `mn-snapshot-${process.pid}-${Date.now()}.db`);
  fs.writeFileSync(tempPath, buffer);
  // A Windows path's backslashes don't survive the file: URL — libSQL parses
  // the result as a different (empty) database and every query then reports a
  // missing table instead of failing outright.
  const client = createClient({ url: `file:${tempPath.replace(/\\/g, '/')}` });
  try {
    const scores = new Map();
    const ranks = new Map();
    let ratingRows;
    try {
      ratingRows = await client.execute('SELECT movie_id, voter, score FROM ratings');
    } catch (_) {
      // The oldest week of snapshots are 4KB files holding nothing but a SQLite
      // header — the workflow ran before there was a database to dump. Skipped
      // rather than read as an empty state, which would date every existing
      // rating to the first snapshot that actually had content.
      return null;
    }
    for (const row of ratingRows.rows) scores.set(`${row.movie_id}|${row.voter}`, row.score);
    try {
      const top3Rows = await client.execute('SELECT movie_id, voter, rank FROM top3');
      for (const row of top3Rows.rows) ranks.set(`${row.movie_id}|${row.voter}`, row.rank);
    } catch (_) { /* very early snapshots may predate the table */ }

    const titles = new Map();
    const movieRows = await client.execute('SELECT id, title FROM movies');
    for (const row of movieRows.rows) titles.set(Number(row.id), row.title);

    return { scores, ranks, titles };
  } finally {
    client.close();
    try { fs.unlinkSync(tempPath); } catch (_) { /* temp file, best effort */ }
  }
}

/** Loads one snapshot's full { scores, ranks } state. */
async function readSnapshot(snapshot) {
  if (snapshot.file.endsWith('.sql')) {
    return readSqlDump(git(['show', `${snapshot.commit}:${snapshot.file}`]));
  }
  return readDbSnapshot(git(['show', `${snapshot.commit}:${snapshot.file}`], 'buffer'));
}

/** Diffs two snapshot states into history rows for `date`. */
function diffStates(previous, current, date, kind) {
  const rows = [];
  const field = kind === 'score' ? 'scores' : 'ranks';
  const before = previous ? previous[field] : new Map();
  const after = current[field];
  for (const key of new Set([...before.keys(), ...after.keys()])) {
    const previousValue = before.has(key) ? before.get(key) : null;
    const nextValue = after.has(key) ? after.get(key) : null;
    if (previousValue === nextValue) continue;
    const [movieId, voter] = key.split('|');
    rows.push({ movieId: Number(movieId), voter, kind, value: nextValue, date });
  }
  return rows;
}

async function main() {
  await db.init();

  const existing = await db.get("SELECT COUNT(*) AS n FROM rating_history WHERE source = 'backfill'");
  if (existing.n > 0 && !FORCE) {
    console.error(`rating_history already holds ${existing.n} backfilled rows. Re-run with --force to redo them.`);
    process.exit(1);
  }

  const branch = resolveBranch();
  let snapshots = listSnapshots(branch);
  if (LIMIT) snapshots = snapshots.slice(0, LIMIT);
  if (snapshots.length === 0) throw new Error(`No snapshots found on ${branch}`);

  console.log(`Reading ${snapshots.length} snapshots from ${branch} (${snapshots[0].date} → ${snapshots[snapshots.length - 1].date})`);

  const rows = [];
  let previous = null;
  for (const snapshot of snapshots) {
    const current = await readSnapshot(snapshot);
    if (current === null) {
      console.log(`  ${snapshot.date}  ${snapshot.file.padEnd(22)} empty snapshot, skipped`);
      continue;
    }
    if (previous === null) {
      // The oldest snapshot is the archive floor: every value in it becomes an
      // origin row, so each series starts somewhere instead of appearing from
      // nowhere at its first real change.
      rows.push(...diffStates(null, current, snapshot.date, 'score'));
      rows.push(...diffStates(null, current, snapshot.date, 'top10'));
      console.log(`  ${snapshot.date}  ${snapshot.file.padEnd(22)} floor: ${current.scores.size} ratings, ${current.ranks.size} picks`);
    } else {
      const dayRows = [
        ...diffStates(previous, current, snapshot.date, 'score'),
        ...diffStates(previous, current, snapshot.date, 'top10'),
      ];
      rows.push(...dayRows);
      if (dayRows.length) console.log(`  ${snapshot.date}  ${snapshot.file.padEnd(22)} ${dayRows.length} change${dayRows.length === 1 ? '' : 's'}`);
    }
    previous = current;
  }

  // The snapshots key everything by movie id, so this only makes sense against
  // a database whose ids ARE the snapshot ids — production, or a restore from
  // one of these dumps. A database seeded from seed.json has its ids reassigned
  // by AUTOINCREMENT in insertion order, and the reconstruction would then
  // silently attach every voter's history to the wrong film. Verified by title
  // rather than trusted, because the failure is invisible once written.
  const lastTitles = previous.titles;
  const dbTitles = new Map((await db.all('SELECT id, title FROM movies')).map(r => [Number(r.id), r.title]));
  let checked = 0;
  let matched = 0;
  for (const [movieId, title] of lastTitles) {
    if (!dbTitles.has(movieId)) continue;
    checked++;
    if (dbTitles.get(movieId) === title) matched++;
  }
  const alignment = checked ? matched / checked : 0;
  console.log(`\nId alignment vs the newest snapshot: ${matched}/${checked} titles match (${Math.round(alignment * 100)}%)`);
  if (alignment < 0.9) {
    console.error(
      'Refusing to write: this database\'s movie ids do not match the snapshots.\n' +
      'That usually means it was seeded from seed.json rather than restored from a\n' +
      'snapshot, so the reconstructed history would land on the wrong films.'
    );
    process.exit(1);
  }

  // Films deleted since a snapshot was taken would fail the movie_id FK.
  const liveIds = new Set((await db.all('SELECT id FROM movies')).map(r => Number(r.id)));
  const usable = rows.filter(r => liveIds.has(r.movieId));
  const dropped = rows.length - usable.length;

  const scoreRows = usable.filter(r => r.kind === 'score').length;
  console.log(`\n${usable.length} rows to write — ${scoreRows} score, ${usable.length - scoreRows} Top 10` +
              (dropped ? ` (${dropped} skipped: film no longer exists)` : ''));

  if (!APPLY) {
    console.log('Dry run — nothing written. Re-run with --apply.');
    return;
  }

  await db.transaction(async (tx) => {
    if (FORCE) await tx.run("DELETE FROM rating_history WHERE source = 'backfill'");
    for (const row of usable) {
      await tx.run(`
        INSERT INTO rating_history (movie_id, voter, kind, score, rank, changed_by, source, changed_at)
        VALUES (?, ?, ?, ?, ?, '', 'backfill', ?)
      `,
        row.movieId,
        row.voter,
        row.kind,
        row.kind === 'score' ? row.value : null,
        row.kind === 'top10' ? row.value : null,
        // Snapshots are taken at 02:00 UTC, so a change first visible on this
        // date was actually made during the preceding day. Stamping the
        // snapshot time keeps the series monotonic and never claims more
        // precision than the archive has.
        `${row.date} 02:00:00`);
    }
  });

  console.log(`Wrote ${usable.length} rows.`);
}

main().catch(err => { console.error(err); process.exit(1); });
