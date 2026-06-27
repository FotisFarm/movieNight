// Top-pick boost: linear 0.1 steps — rank 1 → +1.0, rank 10 → +0.1.
function rankBonus(rank) {
  return rank >= 1 && rank <= 10 ? (11 - rank) / 10 : 0;
}

module.exports = { rankBonus };
