import { useState } from 'react';
import RankIcon from './RankIcon';
import { fmtScore10 as fmt, scoreClass } from '../utils';
import './RankingSection.css';

const RANK_MEDALS = ['🥇', '🥈', '🥉'];

function VoterPills({ voters, top3 }) {
  if (!voters?.length) return null;
  return (
    <div className="rank-voter-pills">
      {voters.map(v => {
        const rank = top3?.[v];
        return (
          <span key={v} className="rank-voter-pill">
            {rank && <span className="rank-voter-medal"><RankIcon rank={rank} /></span>}
            <span className="rank-voter-name">{v.slice(0, 3)}</span>
          </span>
        );
      })}
    </div>
  );
}

export default function RankingSection({ title, rows, onMovieClick, onDirectorClick, onYearClick, onDecadeClick, scoreKey = 'fairBoosted', rowScoreKey = 'fairBoosted', mn = false }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rank-section">
      <div className="rank-header">{title}</div>
      {!rows?.length ? (
        <div className="rank-empty">No data yet</div>
      ) : (
        <>
        <table className="rank-table">
          <tbody>
            {(expanded ? rows : rows.slice(0, 10)).map((row, i) => {
              const val = row[scoreKey] ?? row.avg ?? null;
              const isClickable = row.id || row.director || row.year || row.decade;
              function handleClick() {
                if (row.id)            onMovieClick?.(row.id);
                else if (row.director) onDirectorClick?.(row.director, rowScoreKey, mn);
                else if (row.year)     onYearClick?.(String(row.year), rowScoreKey, mn);
                else if (row.decade)   onDecadeClick?.(row.decade, rowScoreKey, mn);
              }
              return (
                <tr key={row.id ?? row.director ?? row.year ?? row.decade ?? i}
                    className={isClickable ? 'clickable' : ''}
                    onClick={handleClick}>
                  <td className={`rank-num ${i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : ''}`}>
                    {i < 3 ? RANK_MEDALS[i] : i + 1}
                  </td>
                  <td>
                    <div className="rank-name">
                      {row.title ?? row.director ?? (row.year ? `${row.year}` : null) ?? (row.decade ? `${row.decade}s` : null)}
                      {row.mn && <span className="rank-mn">MN</span>}
                    </div>
                    {row.title && <div className="rank-sub">{row.director} · {row.year}</div>}
                    {row.count !== undefined && <div className="rank-sub">{row.count} film{row.count !== 1 ? 's' : ''}</div>}
                    {row.voters?.length > 0 && <VoterPills voters={row.voters} top3={row.top3} />}
                  </td>
                  {row.imdb_rating != null && (
                    <td className="rank-imdb">
                      {row.imdb_id ? (
                        <a href={`https://www.imdb.com/title/${row.imdb_id}/`} className="badge-imdb-pill" target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
                          <span className="imdb-logo">IMDb</span><span className="imdb-rating">{Number.isInteger(row.imdb_rating) ? row.imdb_rating : row.imdb_rating.toFixed(1)}</span>
                        </a>
                      ) : (
                        <span className="badge-imdb-pill"><span className="imdb-logo">IMDb</span><span className="imdb-rating">{Number.isInteger(row.imdb_rating) ? row.imdb_rating : row.imdb_rating.toFixed(1)}</span></span>
                      )}
                    </td>
                  )}
                  <td className={`rank-score ${scoreClass(val)}`}>{fmt(val)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length > 10 && (
          <button
            className="btn btn-ghost btn-sm rank-show-more"
            onClick={() => setExpanded(e => !e)}
          >
            {expanded ? 'Show less' : `Show more (${rows.length - 10})`}
          </button>
        )}
        </>
      )}
    </div>
  );
}
