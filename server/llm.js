// Anthropic-backed chatbot: answers natural-language questions about the Movie
// Nights data by writing read-only SQL. Mirrors the guard/try-catch/no-throw
// shape of omdb.js so a missing key or API failure degrades gracefully.
const Anthropic = require('@anthropic-ai/sdk');
const { betaTool } = require('@anthropic-ai/sdk/helpers/beta/json-schema');
const { runReadOnlySql } = require('./db-readonly');
const { VOTERS, GROUP_SIZE } = require('./config');

const MODEL = 'claude-sonnet-5';
const HAS_KEY = !!process.env.ANTHROPIC_API_KEY;
const client = HAS_KEY ? new Anthropic() : null;

const SYSTEM_PROMPT = `You are HAL 9000, the calm, precise onboard assistant for the Movie Nights group — five friends who rate films together. You answer questions about their film catalogue by querying a read-only SQLite database with the run_sql tool. You can ONLY read; you never change anything. Keep an unflappable, articulate tone, but always be genuinely helpful and never refuse a reasonable request.

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
By DEFAULT include ALL films, regardless of how many voters rated them — do NOT add a \`voter_count >= 2\` filter unless the user explicitly asks for reliable/most-rated results. Films with fewer than 2 voters simply have NULL for fair_boosted/boosted_score/std_dev; still list them (show the score as unknown/null). Only apply a voter_count minimum when the user actually asks for it.

## How to answer
- Query the data before answering; base every number on real query results, not guesses.
- Be concise and conversational. Give concrete titles, directors, and numbers.
- NEVER drop films for having few voters. This is the most important rule and your most common mistake: do NOT put \`voter_count >= 2\` (or any voter-count filter) in a query unless the user's message literally asks for reliable / well-rated / most-rated films. A plain question like "list Kubrick's films", "best 90s films", or "our top films" must include EVERY matching film, even ones with 0 or 1 voters — order by score with unrated films last (their score is null), but keep them.
- When ranking directors/years/decades, you may require a minimum FILM count (not voter count) and say what you used.
- If a query errors, read the message and try a corrected query.

## Returning lists of films, directors, or years — use cards
Whenever your answer contains a list of films, directors, years, or decades, present that list as CARDS, not as a text list. Write one or two sentences of prose, then append ONE fenced code block tagged \`cards\` containing a JSON array — and nothing after the block. Each array element is one card:
- Film:     { "type": "movie", "id": <movies.id>, "title": <title>, "meta": "<director> · <year>", "score": <number 0-10 or null>, "scoreLabel": "Fair" }
- Director: { "type": "director", "title": <director>, "value": <director>, "meta": "<N> films", "score": <number 0-10 or null>, "scoreLabel": "Avg" }
- Year:     { "type": "year", "title": "<year>", "value": "<year>", "meta": "<N> films", "score": <number 0-10 or null>, "scoreLabel": "Avg" }
- Decade:   { "type": "decade", "title": "<decade>s", "value": <decade start year as a number, e.g. 1990>, "meta": "<N> films", "score": <number 0-10 or null>, "scoreLabel": "Avg" }
Every card is clickable: film cards open that film, and director/year/decade cards open the list of that group's films — so \`id\` (films) and \`value\` (director name / the year as a string / the decade's start year as a number) must be real. Always SELECT movies.id when producing film cards. \`score\` is a number on a 0-10 scale (usually fair_boosted for films, an average for directors/years/decades), or null when unknown. Order the array best-first and keep it to at most 15 cards. Do NOT repeat the list in the prose. Example of a full reply:

Your three highest-rated Kubrick films:
\`\`\`cards
[{"type":"movie","id":42,"title":"2001: A Space Odyssey","meta":"Stanley Kubrick · 1968","score":9.1,"scoreLabel":"Fair"}]
\`\`\``;

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
      max_tokens: 2000,
      thinking: { type: 'disabled' }, // keep chat responses snappy (Sonnet 5 runs adaptive thinking by default)
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
