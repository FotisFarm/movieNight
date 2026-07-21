// Anthropic-backed chatbot: answers natural-language questions about the Movie
// Nights data by writing read-only SQL. Mirrors the guard/try-catch/no-throw
// shape of omdb.js so a missing key or API failure degrades gracefully.
const Anthropic = require('@anthropic-ai/sdk');
const { betaTool } = require('@anthropic-ai/sdk/helpers/beta/json-schema');
const { runReadOnlySql } = require('./db-readonly');
const { VOTERS, GROUP_SIZE } = require('./config');

const MODEL = 'claude-haiku-4-5';
const HAS_KEY = !!process.env.ANTHROPIC_API_KEY;
const client = HAS_KEY ? new Anthropic() : null;

const SYSTEM_PROMPT = `You are the Movie Nights assistant — a data analyst for a group of friends who rate films together. Answer questions about their catalogue by querying a read-only SQLite database with the run_sql tool. You can ONLY read; you cannot change anything.

## Voters (${GROUP_SIZE} total)
${VOTERS.join(', ')}
Directors and titles are often in Greek — match them as stored.

## Base tables
movies(id, director, title, year TEXT, rank_global, mn, watchlist, cinobo, tokens, token_pts, imdb_id, imdb_rating)
  - mn = 1 means the film was watched on a Movie Night; watchlist = 1 means it's on the watchlist. Both are 0/1 integers.
ratings(id, movie_id, voter, score REAL, comment)   -- one row per voter who rated a film; UNIQUE(movie_id, voter)
top3(id, movie_id, voter, rank)                      -- each voter's Top-10 picks, rank 1..10 (table name is legacy; it's a Top 10)
watchlist_votes(id, movie_id, voter)                 -- who upvoted a watchlist film

## View: movie_scores (USE THIS for score questions)
One row per film with the app's computed scores already calculated — never re-derive these by hand:
  voter_count   = number of voters who rated the film
  fair_score    = mean of actual voters' scores
  boost         = Top-10 bonus, Σ (11 - rank)/10 over placements
  fair_boosted  = min(10, fair_score + boost)          -- the app's default "Fair score" (NULL if < 2 voters)
  boosted_score = min(10, score_sum/${GROUP_SIZE} + boost) -- the app's "Group score" (NULL if < 2 voters)
  std_dev       = population standard deviation of scores (NULL if < 2 voters), higher = more controversial
Films need at least 2 voters for an aggregate score to be meaningful.

## How to answer
- Query the data before answering; base every number on real query results, not guesses.
- Be concise and conversational. Give concrete titles, directors, and numbers.
- When ranking directors/years/decades, require a sensible minimum film count and say what you used.
- If a query errors, read the message and try a corrected query.`;

const runSqlTool = betaTool({
  name: 'run_sql',
  description:
    'Run a single read-only SQL SELECT (or WITH) query against the Movie Nights SQLite database and get the resulting rows back as JSON. Only SELECT/WITH is permitted.',
  inputSchema: {
    type: 'object',
    properties: {
      sql: {
        type: 'string',
        description: 'A single SQLite SELECT or WITH query. No trailing semicolon needed.',
      },
    },
    required: ['sql'],
    additionalProperties: false,
  },
  run: async ({ sql }) => JSON.stringify(runReadOnlySql(sql)),
});

// messages: [{ role: 'user' | 'assistant', content: string }, ...]
// voter: the logged-in voter's name (for "what should I watch" style questions)
async function chat({ messages, voter }) {
  if (!client) {
    return { reply: 'The chatbot is unavailable — no ANTHROPIC_API_KEY is configured on the server.' };
  }
  try {
    const system = voter
      ? `${SYSTEM_PROMPT}\n\n## Current user\nYou are talking to ${voter}. When they say "I"/"me"/"my", they mean the voter ${voter}.`
      : SYSTEM_PROMPT;

    const finalMessage = await client.beta.messages.toolRunner({
      model: MODEL,
      max_tokens: 1500,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      tools: [runSqlTool],
      messages,
      max_iterations: 8,
    });

    const reply = (finalMessage.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();

    return { reply: reply || 'I could not come up with an answer for that.' };
  } catch (err) {
    return { reply: `Sorry — something went wrong answering that (${err.message}).` };
  }
}

module.exports = { chat };
