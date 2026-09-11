// Resets the 6th member sandbox tables (sandbox_ratings, sandbox_top3,
// sandbox_watchlist_votes, sandbox_rating_history) without touching any
// production data.
//
// Usage:
//   node server/scripts/reset-sandbox.js
//   node server/scripts/reset-sandbox.js --force
//
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env'), quiet: true });
const { createClient } = require('@libsql/client');
const path = require('path');

async function main() {
  const isForce = process.argv.includes('--force');
  const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
  const url = process.env.TURSO_DATABASE_URL || `file:${path.join(DATA_DIR, 'movies.db')}`;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  console.log(`\n🧹 Connecting to database: ${url.replace(/\/\/.*@/, '//***@')}`);
  const client = createClient({ url, authToken });

  const tables = [
    'sandbox_ratings',
    'sandbox_top3',
    'sandbox_watchlist_votes',
    'sandbox_rating_history',
    'sandbox_watchlist_overrides',
  ];

  console.log('\n📊 Current sandbox table counts:');
  const counts = {};
  for (const t of tables) {
    try {
      const res = await client.execute(`SELECT COUNT(*) AS c FROM "${t}"`);
      counts[t] = Number(res.rows[0].c);
      console.log(`  - ${t}: ${counts[t]} rows`);
    } catch (err) {
      console.log(`  - ${t}: (table does not exist yet)`);
      counts[t] = 0;
    }
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total === 0) {
    console.log('\n✅ Sandbox is already empty. Nothing to clear.');
    client.close();
    return;
  }

  if (!isForce) {
    console.log('\n⚠️  Dry run by default. Pass --force to execute the reset.');
    client.close();
    return;
  }

  console.log('\n⚡ Clearing sandbox data...');
  for (const t of tables) {
    try {
      await client.execute(`DELETE FROM "${t}"`);
      console.log(`  ✅ Cleared ${t}`);
    } catch (err) {
      console.warn(`  Note: could not clear ${t}:`, err.message);
    }
  }

  console.log('\n🎉 Sandbox data reset successfully! Production data remains 100% untouched.\n');
  client.close();
}

main().catch(err => {
  console.error('\n❌ Error resetting sandbox:', err.message);
  process.exit(1);
});
