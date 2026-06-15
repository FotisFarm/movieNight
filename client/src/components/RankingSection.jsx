import './RankingSection.css';

const RANK_MEDALS = ['🥇', '🥈', '🥉'];
const MEDALS = { 1: '🥇', 2: '🥈', 3: '🥉' };

function fmt(v) {
  if (v == null) return '–';
  return v.toFixed(2).replace('.', ',') + '/10';
}

function scoreClass(v) {
  if (v == null) return 'score-none';
  if (v >= 7.5) return 'score-high';
  if (v >= 5)   return 'score-mid';
  return 'score-low';
}

function VoterPills({ voters, top3 }) {
  if (!voters?.length) return null;
  return (
    <div className="rank-voter-pills">
      {voters.map(v => {
        const rank = top3?.[v];
        return (
          <span key={v} className="rank-voter-pill">
            {rank && <span className="rank-voter-medal">{MEDALS[rank]}</span>}
            <span className="rank-voter-name">{v.slice(0, 3)}</span>
          </span>
        );
      })}
    </div>
  );
}

export default function RankingSection({ title, rows, onMovieClick, onDirectorClick, onYearClick, scoreKey = 'fairBoosted' }) {
  return (
    <div className="rank-section">
      <div className="rank-header">{title}</div>
      {!rows?.length ? (
        <div className="rank-empty">No data yet</div>
      ) : (
        <table className="rank-table">
          <tbody>
            {rows.map((row, i) => {
              const val = row[scoreKey] ?? row.avg ?? null;
              const isClickable = row.id || row.director || row.year;
              function handleClick() {
                if (row.id)       onMovieClick?.(row.id);
                else if (row.director) onDirectorClick?.(row.director);
                else if (row.year)     onYearClick?.(String(row.year));
              }
              return (
                <tr key={row.id ?? row.director ?? row.year ?? i}
                    className={isClickable ? 'clickable' : ''}
                    onClick={handleClick}>
                  <td className={`rank-num ${i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : ''}`}>
                    {i < 3 ? RANK_MEDALS[i] : i + 1}
                  </td>
                  <td>
                    <div className="rank-name">
                      {row.title ?? row.director ?? row.year}
                      {row.mn && <span className="rank-mn">MN</span>}
                    </div>
                    {row.title && <div className="rank-sub">{row.director} · {row.year}</div>}
                    {row.count !== undefined && <div className="rank-sub">{row.count} film{row.count !== 1 ? 's' : ''}</div>}
                    {row.voters?.length > 0 && <VoterPills voters={row.voters} top3={row.top3} />}
                  </td>
                  <td className={`rank-score ${scoreClass(val)}`}>{fmt(val)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
