// Read-only-ish connection for the chatbot's text-to-SQL tool.
//
// Turso lets you mint a database-scoped *read-only* auth token (`turso db
// tokens create --read-only`) — set it as TURSO_READONLY_AUTH_TOKEN and the
// engine itself rejects every write, same guarantee the old
// better-sqlite3 `{ readonly: true }` local file handle gave us. If that
// token isn't set (e.g. local dev), this falls back to the same
// TURSO_AUTH_TOKEN as the main connection, and the SQL guard below becomes
// the only line of defense — still enforced, just not engine-backed.
const { createClient } = require('@libsql/client');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const url = process.env.TURSO_DATABASE_URL || `file:${path.join(DATA_DIR, 'movies.db')}`;
const authToken = process.env.TURSO_READONLY_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN;

const roClient = createClient({ url, authToken });

const MAX_ROWS = 200;

// A leading-keyword check alone is NOT sufficient: SQLite allows a CTE to
// prefix a write statement, so
//   WITH doomed AS (SELECT id FROM movies) DELETE FROM movies WHERE ...
// begins with "with", is a single statement, and happily deletes every row.
// Verified against a scratch DB before this guard existed. So we also scan
// the whole statement for write/DDL keywords.
const WRITE_KEYWORDS =
  /\b(insert|update|delete|drop|alter|create|attach|detach|pragma|vacuum|reindex|begin|commit|rollback|savepoint|release)\b|\breplace\s+into\b/i;

// Strip string literals and quoted identifiers first, so a film title such as
// "Deleted Scenes" or a comment mentioning "update" can't trip the scan.
function stripLiterals(sql) {
  return sql
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/"(?:[^"]|"")*"/g, '""');
}

// Runs a single read-only SELECT/WITH query and returns { rows } or { error }.
// Never throws — the LLM tool loop surfaces the error string and can retry.
async function runReadOnlySql(rawSql) {
  const sql = String(rawSql || '').trim().replace(/;+\s*$/, '');
  if (!/^(select|with)\b/i.test(sql)) {
    return { error: 'Only single read-only SELECT/WITH queries are allowed.' };
  }
  if (WRITE_KEYWORDS.test(stripLiterals(sql))) {
    return { error: 'Only read-only queries are allowed — write and DDL keywords are rejected.' };
  }
  try {
    // client.execute() rejects multi-statement strings; a read-only auth
    // token (when configured) rejects any write at the engine level too.
    const rs = await roClient.execute(sql);
    const rows = rs.rows;
    const truncated = rows.length > MAX_ROWS;
    return {
      rows: truncated ? rows.slice(0, MAX_ROWS) : rows,
      rowCount: rows.length,
      truncated,
    };
  } catch (err) {
    return { error: err.message };
  }
}

module.exports = { runReadOnlySql };
