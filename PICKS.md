# How the Picks formula works

The **Picks** page (`/recommendations`, served by `server/routes/recommendations.js`) answers:
*"We haven't really watched this film yet — how much would the group probably like it?"*

For a film with very few votes you can't trust its raw average (one person loving it ≠ the group
loving it). So Picks **predicts** a group score by blending the little real data that exists with an
educated guess ("prior") built from similar films.

## Which films are candidates
Only films with few votes: `voterCount ≤ maxVoters` (default **2**, set by the "Max voters" control).
Fully-rated films are excluded — they belong on Rankings.

## The blend
```
confidence     = voterCount / 5                 // 0 votes -> 0%, 1 -> 20%, 2 -> 40%
basePrior      = sum(activeComponent * weight) / sum(activeWeights)
haloBoost      = min(0.75, priorPoints * breadthMultiplier * twRate)
prior          = min(10.0, basePrior + haloBoost)
predictedScore = confidence * actualScore + (1 - confidence) * prior
```
The more real votes a film has, the more we trust its own score; the fewer, the more we lean on the
prior. Since candidates have <= 2 votes, `confidence <= 40%` — **the prior dominates every Pick**.

- `actualScore` — the film's own `fairBoosted` (per-voter mean + top-pick boost), only if >= 2 votes; else `null`.
- Default weights: `dw = 0.35` (Director), `lbw = 0.40` (Letterboxd), `ew = 0.25` (Era), `tw = 0.10` (Top 10 Halo Boost rate).

## The prior's signals
| Signal | Meaning | Default weight |
|---|---|---|
| `dirAvg` | mean `fairBoosted` of all rated films by the **same director** (>= 2 films) | `dw = 0.35` |
| `lbScore` | Letterboxd community rating scaled to 10 (`rating * 2.0`) | `lbw = 0.40` |
| `decAvg` | mean `fairBoosted` of all rated films from the **same decade** | `ew = 0.25` |
| `haloBoost` | how treasured the director is across voter Top 10s (with breadth bonus) | `tw = 0.10` |

### `haloBoost` with Catalog Breadth Multiplier
A per-director measure of *"how much do people personally treasure this director's films."* Built in
two steps:
1. **Accumulate, rank-weighted.** For every top-pick entry in the DB, add `rankBonus(rank)` to that
   film's director: `rankBonus(rank) = (11 - rank)/10` -> #1 = 1.0, #2 = 0.9, ... #10 = 0.1.
2. **Catalog Breadth Multiplier**:
   `breadthMultiplier = 1.0 + 0.20 * max(0, priorUniqueFilms - 1)`
   Rewards consistent masters over one-hit wonders (+20% for 2 distinct masterworks, +40% for 3, etc.).
3. **Scale & Cap**: `haloBoost = min(0.75, priorPoints * breadthMultiplier * twRate)`.

## Edge cases
- **Missing a signal** (e.g. debut director or missing Letterboxd rating): the weights are dynamically normalized across available components, so the prior never collapses.
- **Hidden Gems toggle**: filters for films with Letterboxd >= 3.8 (7.6/10) whose directors have <= 1 rated films in the group database.

## Worked examples
**1 — 0 votes** (Kurosawa, 1980s, LB 4.3): `dirAvg 9.4`, `lbScore 8.6`, `decAvg 8.8`, `haloBoost +0.30`
-> `basePrior = (9.4*0.35 + 8.6*0.40 + 8.8*0.25) / 1.0 = (3.29 + 3.44 + 2.20) = 8.93`
-> `prior = min(10.0, 8.93 + 0.30) = 9.23`; no actual -> `predictedScore = 9.23`.

**2 — same film, 2 votes averaging 7.5**: `confidence = 0.4`
-> `0.4 * 7.5 + 0.6 * 9.23 = 3.0 + 5.54 = 8.54`. Its two votes get pulled toward the prior.
