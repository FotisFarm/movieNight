// Voter pick rank → icon. Medals for 1–3, a small number badge for 4–10.
const MEDALS = { 1: '🥇', 2: '🥈', 3: '🥉' };

export default function RankIcon({ rank }) {
  if (!rank) return null;
  return MEDALS[rank]
    ? <span className="rank-icon">{MEDALS[rank]}</span>
    : <span className="rank-icon rank-badge">{rank}</span>;
}
