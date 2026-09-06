// Fast-forwards the dev database with the latest production backup from the `backups` branch.
//
// Usage:
//   node server/scripts/fast-forward-dev-db.js           # Fast-forwards local dev (server/data/movies.db)
//   node server/scripts/fast-forward-dev-db.js --remote  # Fast-forwards remote Turso (uses TURSO_DATABASE_URL/AUTH_TOKEN in env)

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { createClient } = require('@libsql/client');

async function main() {
  const isRemote = process.argv.includes('--remote');
  console.log(`\n🚀 Fast-forwarding ${isRemote ? 'REMOTE Turso' : 'LOCAL dev'} database from production...\n`);

  // 1. Identify the latest snapshot file
  let latestFile = null;
  let sqlDump = null;

  const backupsDir = process.env.BACKUPS_DIR || path.join(__dirname, '..', '..', 'backups-branch');
  if (fs.existsSync(backupsDir)) {
    console.log(`📂 Reading snapshots from folder: ${backupsDir}...`);
    const files = fs.readdirSync(backupsDir)
      .filter(f => f.startsWith('movies_') && f.endsWith('.sql'))
      .sort();
    if (files.length > 0) {
      latestFile = files[files.length - 1];
      console.log(`📄 Found latest snapshot: ${latestFile}`);
      sqlDump = fs.readFileSync(path.join(backupsDir, latestFile), 'utf8');
    }
  }

  if (!sqlDump) {
    console.log('📦 Fetching latest snapshots from git origin/backups...');
    let backupRef = 'origin/backups';
    try {
      execSync('git fetch origin backups:refs/remotes/origin/backups --force', { stdio: 'pipe' });
    } catch (err) {
      try {
        execSync('git fetch origin backups', { stdio: 'pipe' });
        backupRef = 'FETCH_HEAD';
      } catch (_) {
        console.warn('⚠️  Could not fetch origin/backups over network, trying local git cache...');
      }
    }

    let backupFiles = [];
    try {
      let lsOutput;
      try {
        lsOutput = execSync(`git ls-tree ${backupRef}`, { encoding: 'utf8' });
      } catch (_) {
        lsOutput = execSync('git ls-tree origin/backups', { encoding: 'utf8' });
        backupRef = 'origin/backups';
      }
      backupFiles = lsOutput
        .split('\n')
        .filter(line => line.includes('movies_') && line.endsWith('.sql'))
        .map(line => line.split('\t')[1])
        .filter(Boolean)
        .sort();
    } catch (err) {
      console.error('❌ Failed to list files from origin/backups:', err.message);
      process.exit(1);
    }

    if (backupFiles.length === 0) {
      console.error('❌ No SQL snapshots found on origin/backups branch.');
      process.exit(1);
    }

    latestFile = backupFiles[backupFiles.length - 1];
    console.log(`📄 Found latest snapshot: ${latestFile}`);

    console.log('⏳ Extracting snapshot contents...');
    sqlDump = execSync(`git show ${backupRef}:${latestFile}`, {
      encoding: 'utf8',
      maxBuffer: 100 * 1024 * 1024,
    });
  }

  // Sanitize SQL dump: strip BEGIN TRANSACTION and COMMIT because executeMultiple
  // already executes all statements atomically as a single pipeline.
  const cleanSqlDump = sqlDump
    .replace(/^\s*BEGIN\s+TRANSACTION\s*;/gmi, '')
    .replace(/^\s*COMMIT\s*;/gmi, '');

  // 4. Connect to target database
  let targetUrl;
  let authToken;
  const DATA_DIR = path.join(__dirname, '..', 'data');
  const localDbPath = path.join(DATA_DIR, 'movies.db');

  if (isRemote) {
    targetUrl = process.env.TURSO_DATABASE_URL;
    authToken = process.env.TURSO_AUTH_TOKEN;
    if (!targetUrl || !authToken) {
      console.error('❌ When using --remote, TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set in environment.');
      process.exit(1);
    }
  } else {
    targetUrl = `file:${localDbPath}`;
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

    // Backup existing local database if it exists
    if (fs.existsSync(localDbPath)) {
      const backupPath = path.join(DATA_DIR, `movies.db.pre-sync.bak`);
      fs.copyFileSync(localDbPath, backupPath);
      console.log(`💾 Backed up current local DB to ${backupPath}`);
    }
  }

  const client = createClient({ url: targetUrl, authToken });

  // 5. Query counts before restore
  let beforeCounts = { movies: 0, ratings: 0, top3: 0 };
  try {
    const m = await client.execute('SELECT COUNT(*) as c FROM movies');
    const r = await client.execute('SELECT COUNT(*) as c FROM ratings');
    const t = await client.execute('SELECT COUNT(*) as c FROM top3');
    beforeCounts = { movies: m.rows[0].c, ratings: r.rows[0].c, top3: t.rows[0].c };
  } catch (_) {
    // Tables may not exist yet if fresh DB
  }

  // 6. Execute SQL dump
  console.log('⚡ Applying production snapshot (this takes 1-2 seconds)...');
  await client.executeMultiple(cleanSqlDump);

  // 7. Recreate view and run migrations via db.init()
  console.log('🔧 Recreating derived views (movie_scores)...');
  const db = require('../db');
  await db.init();

  // 8. Query counts after restore
  const afterM = await client.execute('SELECT COUNT(*) as c FROM movies');
  const afterR = await client.execute('SELECT COUNT(*) as c FROM ratings');
  const afterT = await client.execute('SELECT COUNT(*) as c FROM top3');
  const afterCounts = { movies: afterM.rows[0].c, ratings: afterR.rows[0].c, top3: afterT.rows[0].c };

  client.close();

  console.log('\n✅ Database fast-forwarded successfully to latest production data!\n');
  console.log('┌─────────────┬───────────┬──────────┬───────────┐');
  console.log('│ Table       │ Before    │ After    │ Diff      │');
  console.log('├─────────────┼───────────┼──────────┼───────────┤');
  console.log(`│ Movies      │ ${String(beforeCounts.movies).padEnd(9)} │ ${String(afterCounts.movies).padEnd(8)} │ +${String(afterCounts.movies - beforeCounts.movies).padEnd(8)} │`);
  console.log(`│ Ratings     │ ${String(beforeCounts.ratings).padEnd(9)} │ ${String(afterCounts.ratings).padEnd(8)} │ +${String(afterCounts.ratings - beforeCounts.ratings).padEnd(8)} │`);
  console.log(`│ Top 10s     │ ${String(beforeCounts.top3).padEnd(9)} │ ${String(afterCounts.top3).padEnd(8)} │ +${String(afterCounts.top3 - beforeCounts.top3).padEnd(8)} │`);
  console.log('└─────────────┴───────────┴──────────┴───────────┘\n');
}

main().catch(err => {
  console.error('❌ Error during database fast-forward:', err);
  process.exit(1);
});
