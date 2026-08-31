import RankIcon from './RankIcon';
import { fmtScore10 as fmt, scoreClass, posterUrl } from '../utils';
import { useAppConfig } from '../AppConfigContext';
import './MovieCard.css';

function VoterPills({ ratings, top3, voters }) {
  return voters.map(v => {
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

// Fixed 2:3 box so the row height never changes as images stream in, and the
// films with no poster (a wrong or missing imdb_id) still line up with the rest.
function Poster({ path, title, size }) {
  const src = posterUrl(path, size);
  return (
    <div className="card-poster">
      {src
        ? <img src={src} alt="" loading="lazy" decoding="async" />
        : <span className="card-poster-empty" aria-hidden="true">🎞</span>}
    </div>
  );
}

export default function MovieCard({ movie, onClick, listView = false, scoreMode = 'fair' }) {
  const { voters, minVoters } = useAppConfig();
  const { title, director, year, mn, watchlist, rank_global, mn_rank, ratings, top3, fairBoosted, voterCount, imdb_rating, imdb_id, poster_path } = movie;

  const hasScore = voterCount >= minVoters;
  const displayScore = hasScore
    ? (scoreMode === 'group' ? (movie.boostedScore ?? null) : (fairBoosted ?? null))
    : null;

  const cardClass = `movie-card${mn ? ' mn' : ''}${listView ? ' list-view' : ''}`;
  const keyProps = { role: 'button', tabIndex: 0, onKeyDown: e => e.key === 'Enter' && onClick() };

  const ImdbBadge = imdb_rating != null && (
    imdb_id ? (
      <a
        href={`https://www.imdb.com/title/${imdb_id}/`}
        className="badge-imdb-pill"
        target="_blank"
        rel="noopener noreferrer"
        onClick={e => e.stopPropagation()}
        title="View on IMDb"
      >
        <span className="imdb-logo">IMDb</span>
        <span className="imdb-rating">{Number.isInteger(imdb_rating) ? imdb_rating : imdb_rating.toFixed(1)}</span>
      </a>
    ) : (
      <span className="badge-imdb-pill">
        <span className="imdb-logo">IMDb</span>
        <span className="imdb-rating">{Number.isInteger(imdb_rating) ? imdb_rating : imdb_rating.toFixed(1)}</span>
      </span>
    )
  );

  if (listView) {
    return (
      <article className={cardClass} onClick={onClick} {...keyProps}>
        <Poster path={poster_path} title={title} size="w92" />

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
          <VoterPills ratings={ratings} top3={top3} voters={voters} />
        </div>

        {ImdbBadge}
      </article>
    );
  }

  return (
    <article className={cardClass} onClick={onClick} {...keyProps}>
      <Poster path={poster_path} title={title} size="w185" />

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
          <VoterPills ratings={ratings} top3={top3} voters={voters} />
        </div>

        {ImdbBadge}
      </div>
    </article>
  );
}
