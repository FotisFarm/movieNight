import { useState } from 'react';
import RankIcon from './RankIcon';
import WatchlistBadge from './WatchlistBadge';
import { fmtScore10 as fmt, scoreClass, posterUrl, formatRuntime } from '../utils';
import { useAppConfig } from '../AppConfigContext';
import {
  useRatingHistory, useAnchor, useHoverIntent, HistoryPopover, HistoryWindow,
} from './RatingHistory';
import LetterboxdPill from './LetterboxdPill';
import './MovieCard.css';

// Each pill is the entry point to that voter's rating history: hover (or tap)
// floats a small stepped graph, clicking opens the detail window. The history
// itself is only fetched once a pill is actually hovered — see RatingHistory.
function VoterPills({ movieId, title, ratings, top3, voters }) {
  const [openVoter, setOpenVoter] = useState(null);
  const [anchorEl, setAnchorEl] = useState(null);
  const [detailVoter, setDetailVoter] = useState(null);

  const { loading, data } = useRatingHistory(movieId, !!openVoter || !!detailVoter);
  const anchor = useAnchor(openVoter ? anchorEl : null);
  const hover = useHoverIntent();

  const close = () => { setOpenVoter(null); setAnchorEl(null); };

  const openDetail = (voter) => { close(); setDetailVoter(voter); };

  // The card itself opens MovieModal on click, so every pill interaction has to
  // stop propagating — same rule the IMDb badge already follows.
  const handleClick = (event, voter) => {
    event.stopPropagation();
    hover.cancel();
    if (openVoter === voter) openDetail(voter);   // second tap on mobile
    else { setOpenVoter(voter); setAnchorEl(event.currentTarget); }
  };

  return (
    <>
      {voters.map(v => {
        const score = ratings?.[v];
        if (score == null) return null;
        const rank = top3?.[v];
        return (
          <span
            key={v}
            className={`voter-pill rh-has-history${openVoter === v ? ' rh-open' : ''}`}
            role="button"
            tabIndex={0}
            aria-label={`${v} rated ${score} — show rating history`}
            onMouseEnter={e => { const el = e.currentTarget; hover.enter(() => { setOpenVoter(v); setAnchorEl(el); }); }}
            onMouseLeave={() => hover.leave(close)}
            onClick={e => handleClick(e, v)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick(e, v); } }}
          >
            {rank && <span className="voter-medal"><RankIcon rank={rank} /></span>}
            <span className="voter-abbr">{v.slice(0, 3)}</span>
            <span className={`voter-score ${scoreClass(score)}`}>
              {Number.isInteger(score) ? score : score.toFixed(1)}
            </span>
          </span>
        );
      })}

      {openVoter && anchor && (
        <HistoryPopover
          voter={openVoter}
          rows={data?.[openVoter] || []}
          loading={loading}
          anchor={anchor}
          onOpen={() => openDetail(openVoter)}
          onHoverEnter={hover.cancel}
          onHoverLeave={() => hover.leave(close)}
        />
      )}

      {detailVoter && (
        <HistoryWindow
          title={title}
          voter={detailVoter}
          rows={data?.[detailVoter] || []}
          onClose={() => setDetailVoter(null)}
        />
      )}
    </>
  );
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

export default function MovieCard({ movie, onClick, listView = false, scoreMode = 'fair', onWatchlistToggle }) {
  const { voters, minVoters } = useAppConfig();
  const { id, title, director, year, runtime, mn, watchlist, rank_global, mn_rank, ratings, top3, fairBoosted, voterCount, imdb_rating, imdb_id, letterboxd_rating, poster_path } = movie;

  const hasScore = voterCount >= minVoters;
  const displayScore = hasScore
    ? (scoreMode === 'group' ? (movie.boostedScore ?? null) : (fairBoosted ?? null))
    : null;

  const cardClass = `movie-card${mn ? ' mn' : ''}${listView ? ' list-view' : ''}`;
  const keyProps = { role: 'button', tabIndex: 0, onKeyDown: e => e.key === 'Enter' && onClick() };

  const LetterboxdBadge = (imdb_id || letterboxd_rating != null) && (
    <LetterboxdPill imdbId={imdb_id} score={letterboxd_rating} />
  );

  if (listView) {
    const hasBadges = Boolean(mn || watchlist || rank_global || onWatchlistToggle);
    const hasVoterRatings = Boolean(voters && voters.some(v => ratings?.[v] != null));

    return (
      <article className={cardClass} onClick={onClick} {...keyProps}>
        <div className="card-list-main">
          <Poster path={poster_path} title={title} size="w92" />

          {displayScore !== null && (
            <div className="card-score">
              <div className={`score-big ${scoreClass(displayScore)}`}>{fmt(displayScore)}</div>
            </div>
          )}

          <div className="card-info">
            <h3 className="card-title">{title}</h3>
            <p className="card-meta">
              <span className="card-director">{director}</span>
              {year ? <> · <span className="card-year">{year}</span></> : null}
              {runtime ? <> · <span className="card-runtime">{formatRuntime(runtime)}</span></> : null}
            </p>
          </div>
        </div>

        {(hasBadges || hasVoterRatings || LetterboxdBadge) && (
          <div className="card-list-aside">
            {hasBadges && (
              <div className="card-badges">
                {mn          && <span className="badge badge-mn">MN{mn_rank ? ` #${mn_rank}` : ''}</span>}
                <WatchlistBadge id={id} watchlist={watchlist} onToggle={onWatchlistToggle} />
                {rank_global && <span className="badge badge-ranked">#{rank_global}</span>}
              </div>
            )}

            {hasVoterRatings && (
              <div className="card-ratings">
                <VoterPills movieId={id} title={title} ratings={ratings} top3={top3} voters={voters} />
              </div>
            )}

            {LetterboxdBadge}
          </div>
        )}
      </article>
    );
  }

  const hasBadges = Boolean(mn || watchlist || rank_global || onWatchlistToggle);
  const hasVoterRatings = Boolean(voters && voters.some(v => ratings?.[v] != null));
  const hasRatingsOrLb = Boolean(hasVoterRatings || imdb_id || letterboxd_rating != null);

  return (
    <article className={cardClass} onClick={onClick} {...keyProps}>
      <Poster path={poster_path} title={title} size="w185" />

      <div className="card-body">
        <div className="card-header-row">
          <h3 className="card-title" title={title}>{title}</h3>
          {displayScore !== null && (
            <div className={`score-big ${scoreClass(displayScore)} card-grid-score`}>
              {fmt(displayScore)}
            </div>
          )}
        </div>

        <p className="card-meta">
          <span className="card-director">{director}</span>
          {year ? <> · <span className="card-year">{year}</span></> : null}
          {runtime ? <> · <span className="card-runtime">{formatRuntime(runtime)}</span></> : null}
        </p>

        {hasBadges && (
          <div className="card-badges">
            {mn          && <span className="badge badge-mn">MN{mn_rank ? ` #${mn_rank}` : ''}</span>}
            <WatchlistBadge id={id} watchlist={watchlist} onToggle={onWatchlistToggle} />
            {rank_global && <span className="badge badge-ranked">#{rank_global}</span>}
          </div>
        )}

        {hasRatingsOrLb && (
          <div className="card-ratings">
            {hasVoterRatings && (
              <VoterPills movieId={id} title={title} ratings={ratings} top3={top3} voters={voters} />
            )}
            {LetterboxdBadge}
          </div>
        )}
      </div>
    </article>
  );
}
