import RankIcon from './RankIcon';
import { VOTERS } from '../constants';
import { fmtScore10 as fmt, scoreClass } from '../utils';
import './MovieCard.css';

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
  const { title, director, year, mn, watchlist, rank_global, mn_rank, ratings, top3, fairBoosted, voterCount, imdb_rating, imdb_id } = movie;

  const hasScore = voterCount >= 2;
  const displayScore = hasScore
    ? (scoreMode === 'group' ? (movie.boostedScore ?? null) : (fairBoosted ?? null))
    : null;

  const cardClass = `movie-card${mn ? ' mn' : ''}${listView ? ' list-view' : ''}`;
  const keyProps = { role: 'button', tabIndex: 0, onKeyDown: e => e.key === 'Enter' && onClick() };

  const imdbLabel = imdb_rating != null
    ? (Number.isInteger(imdb_rating) ? imdb_rating : imdb_rating.toFixed(1))
    : null;

  const ImdbInline = imdbLabel && (
    imdb_id ? (
      <a
        href={`https://www.imdb.com/title/${imdb_id}/`}
        className="card-imdb-inline"
        target="_blank"
        rel="noopener noreferrer"
        onClick={e => e.stopPropagation()}
        title="View on IMDb"
      >
        <span className="card-imdb-logo">IMDb</span>{imdbLabel}
      </a>
    ) : (
      <span className="card-imdb-inline"><span className="card-imdb-logo">IMDb</span>{imdbLabel}</span>
    )
  );

  if (listView) {
    return (
      <article className={cardClass} onClick={onClick} {...keyProps}>
        <div className="card-score">
          {displayScore !== null && (
            <div className={`score-big ${scoreClass(displayScore)}`}>{fmt(displayScore)}</div>
          )}
        </div>

        <div className="card-info">
          <div className="card-title-row">
            <h3 className="card-title">{title}</h3>
            {ImdbInline}
          </div>
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
        <div className="card-title-row">
          <h3 className="card-title">{title}</h3>
          {ImdbInline}
        </div>
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
