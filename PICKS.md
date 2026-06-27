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
confidence     = voterCount / 5                 // 0 votes→0%, 1→20%, 2→40%
prior          = dirAvg·dw + decAvg·ew + top10Bonus·tw
predictedScore = confidence·actualScore + (1 − confidence)·prior
```
The more real votes a film has, the more we trust its own score; the fewer, the more we lean on the
prior. Since candidates have ≤2 votes, `confidence ≤ 40%` — **the prior dominates every Pick**.

- `actualScore` — the film's own `fairBoosted` (per-voter mean + top-pick boost), only if ≥2 votes; else `null`.
- Default weights `dw = ew = 0.45`, `tw = 0.10` (the bias sliders; normalised to sum to 1).

## The prior's three signals
| Signal | Meaning | Default weight |
|---|---|---|
| `dirAvg` | mean `fairBoosted` of all rated films by the **same director** | `dw = 0.45` |
| `decAvg` | mean `fairBoosted` of all rated films from the **same decade** | `ew = 0.45` |
| `top10Bonus` | how treasured the **director** is (see below) | `tw = 0.10` |

### `top10Bonus` in detail
A per-director measure of *"how much do people personally treasure this director's films."* Built in
two steps:
1. **Accumulate, rank-weighted.** For every top-pick entry in the DB, add `rankBonus(rank)` to that
   film's director: `rankBonus(rank) = (11 − rank)/10` → #1 = 1.0, #2 = 0.9, … #10 = 0.1. A director
   collects strength from every pick any voter gave to any of their films.
2. **Cap.** `top10Bonus = min(5, sum)`.

It enters the prior as `top10Bonus · tw` — a small nudge for beloved directors.

## Edge cases
- **Missing a signal** (director or decade has no rated films): that weight is redistributed across the
  remaining two, so the prior never collapses.
- **Real score but no prior at all** (brand-new director *and* decade): `predictedScore =
  confidence·actualScore` only — which *deflates* the score (e.g. 0.4 × 7.5 = 3.0). Rare quirk.

## Worked examples
**1 — 0 votes** (Kurosawa, 1980s): `dirAvg 9.4`, `decAvg 9.0`, `top10Bonus 0`
→ `prior = 9.4·0.45 + 9.0·0.45 + 0 = 8.28`; no actual → `predictedScore = 8.28`.

**2 — same film, 2 votes averaging 7.5**: `confidence = 0.4`
→ `0.4·7.5 + 0.6·8.28 = 3.0 + 4.97 = 7.97`. Its two votes get pulled *up* toward the prior.

**3 — top10Bonus impact** (Leone, `dirAvg 8.5`, `decAvg 8.0`, picks = #2 +0.9 & #3 +0.8 → `top10Bonus 1.7`)
→ `prior = 8.5·0.45 + 8.0·0.45 + 1.7·0.10 = 3.825 + 3.6 + 0.17 = 7.60`. Even a healthy 1.7 only adds
0.17, because `tw` is just 0.10 — raise the Top-3 slider if you want directors to matter more.
