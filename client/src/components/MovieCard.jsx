import RankIcon from './RankIcon';
import './MovieCard.css';

const VOTERS = ['Μητσέας', 'Παντελής', 'Στέλιας', 'Φώτης', 'Λεόντιος'];

function scoreClass(v) {
  if (v === null || v === undefined) return 'score-none';
  if (v >= 7.5) return 'score-high';
  if (v >= 5)   return 'score-mid';
  return 'score-low';
}

function fmt(v) {
  if (v == null) return '–';
  return v.toFixed(2).replace('.', ',') + '/10';
}

function VoterPills({ ratings, top3 }) {
  return VOTERS.map(v => {
    const score = ratings?.[v];
    if (score == null) return null;
    const rank = top3?.[v];
    return (
      <span key={v} className="voter-pill">
        {rank && <span className="voter-medal"><RankIcon rank={rank} /></span>}
        <span className="voter-abbr">{v.slice(0, 3)}</span>
        <span className={`voter-score ${scoreClass(score)}`}>
          {Number.isInteger(score) ? score : score.toFixed(1)}
        </span>
      </span>
    );
  });
}

export default function MovieCard({ movie, onClick, listView = false, scoreMode = 'fair' }) {
  const { title, director, year, mn, watchlist, rank_global, mn_rank, ratings, top3, fairBoosted, voterCount } = movie;

  const hasScore = voterCount >= 2;
  const displayScore = hasScore
    ? (scoreMode === 'group' ? (movie.boostedScore ?? null) : (fairBoosted ?? null))
    : null;

  const cardClass = `movie-card${mn ? ' mn' : ''}${listView ? ' list-view' : ''}`;
  const keyProps = { role: 'button', tabIndex: 0, onKeyDown: e => e.key === 'Enter' && onClick() };

  if (listView) {
    return (
      <article className={cardClass} onClick={onClick} {...keyProps}>
        <div className="card-score">
          {displayScore !== null && (
            <div className={`score-big ${scoreClass(displayScore)}`}>{fmt(displayScore)}</div>
          )}
        </div>

        <div className="card-info">
          <h3 className="card-title">{title}</h3>
          <p className="card-meta">
            <span className="card-director">{director}</span>
            {year ? <> · <span className="card-year">{year}</span></> : null}
          </p>
        </div>

        <div className="card-badges">
          {mn          && <span className="badge badge-mn">MN{mn_rank ? ` #${mn_rank}` : ''}</span>}
          {watchlist   && <span className="badge badge-wl">WL</span>}
          {rank_global && <span className="badge badge-ranked">#{rank_global}</span>}
        </div>

        <div className="card-ratings">
          <VoterPills ratings={ratings} top3={top3} />
        </div>
      </article>
    );
  }

  return (
    <article className={cardClass} onClick={onClick} {...keyProps}>
      <div className="card-score">
        {displayScore !== null && (
          <div className={`score-big ${scoreClass(displayScore)}`}>{fmt(displayScore)}</div>
        )}
      </div>

      <div className="card-body">
        <h3 className="card-title">{title}</h3>
        <p className="card-meta">
          <span className="card-director">{director}</span>
          {year ? <> · <span className="card-year">{year}</span></> : null}
        </p>

        <div className="card-badges">
          {mn          && <span className="badge badge-mn">MN{mn_rank ? ` #${mn_rank}` : ''}</span>}
          {watchlist   && <span className="badge badge-wl">WL</span>}
          {rank_global && <span className="badge badge-ranked">#{rank_global}</span>}
        </div>

        <div className="card-ratings">
          <VoterPills ratings={ratings} top3={top3} />
        </div>
      </div>
    </article>
  );
}
