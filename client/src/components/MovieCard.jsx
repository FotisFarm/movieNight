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

function OriginalsCompanionPill({ originalsScore, originalsBoostedScore, scoreMode = 'fair', originalsVoterCount, otherRatings, originalsMn }) {
  const currentScore = scoreMode === 'group'
    ? (originalsBoostedScore ?? originalsScore)
    : originalsScore;

  if (currentScore == null) return null;
  const score = Number.isInteger(currentScore) ? currentScore.toFixed(1) : currentScore;

  const modeLabel = scoreMode === 'group' ? 'Group Score' : 'Fair Score';
  let tooltip = `The Originals ${modeLabel}: ${score}`;
  if (originalsVoterCount) {
    tooltip += ` (${originalsVoterCount} ${originalsVoterCount === 1 ? 'vote' : 'votes'})`;
  }
  if (originalsMn) {
    tooltip += ' · Official Movie Night';
  }
  if (otherRatings) {
    const entries = Object.entries(otherRatings).filter(([, r]) => r && r.score != null);
    if (entries.length > 0) {
      tooltip += '\n' + entries.map(([v, r]) => `• ${v}: ${r.score}${r.comment ? ` ("${r.comment}")` : ''}`).join('\n');
    }
  }

  return (
    <span className="companion-pill" title={tooltip}>
      <span className="companion-label">🎬 Originals{originalsMn ? ' ★' : ''}</span>
      <span className={`companion-score ${scoreClass(Number(score))}`}>{score}</span>
    </span>
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

export function StreamBadge({ streamGr }) {
  if (!streamGr) return null;
  const providers = streamGr.split('|').map(s => s.trim()).filter(Boolean);
  if (!providers.length) return null;

  const primary = providers[0];
  const lower = primary.toLowerCase();
  const extra = providers.length > 1 ? ` +${providers.length - 1}` : '';
  const tooltip = `Stream in Greece on: ${providers.join(', ')}`;

  let icon = null;
  let label = primary;
  let badgeClass = 'badge-stream badge-stream-default';

  if (lower.includes('netflix')) {
    icon = (
      <svg width="9" height="12" viewBox="0 0 10 14" fill="none" style={{ flexShrink: 0 }}>
        <path d="M0 0H2.5V14H0V0Z" fill="#B81D24"/>
        <path d="M7.5 0H10V14H7.5V0Z" fill="#B81D24"/>
        <path d="M0 0H2.6L7.5 14H5L0 0Z" fill="#E50914"/>
      </svg>
    );
    label = 'Netflix';
    badgeClass = 'badge-stream badge-stream-netflix';
  } else if (lower.includes('cinobo')) {
    icon = (
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
        <circle cx="12" cy="12" r="10" stroke="#FFD54F" strokeWidth="2.8"/>
        <path d="M16 8C14.5 6.5 12 6 9.5 7.5C7 9 6.5 12 7.5 14.5C8.5 17 11.5 18 14 17C15.5 16.2 16.5 15 17 14" stroke="#FFD54F" strokeWidth="2.8" strokeLinecap="round"/>
      </svg>
    );
    label = 'Cinobo';
    badgeClass = 'badge-stream badge-stream-cinobo';
  } else if (lower.includes('apple')) {
    icon = (
      <svg width="9" height="11" viewBox="0 0 170 170" fill="currentColor" style={{ flexShrink: 0 }}>
        <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.35.13-9.16-1.9-14.42-6.08-3.7-3.05-7.62-7.85-11.77-14.4-6.41-10.13-11.35-21.84-14.83-35.14-3.48-13.3-5.22-25.75-5.22-37.35 0-16.74 4.54-30.73 13.62-41.97 9.08-11.24 20.3-16.96 33.67-17.18 5.43 0 11.16 1.34 17.18 4.02 6.02 2.68 10.14 4.07 12.37 4.17 1.85 0 6.1-1.39 12.74-4.17 6.64-2.78 12.22-4.02 16.74-3.72 12.7.75 22.84 5.37 30.43 13.86-11.06 6.72-16.48 16.03-16.27 27.93.22 9.69 3.86 17.84 10.93 24.45 7.07 6.61 15.61 10.42 25.62 11.44-2.07 6.1-4.63 12.42-7.68 18.96zM119.22 33.09c0-7.39 2.66-14.36 7.97-20.91 5.31-6.55 11.75-10.66 19.32-12.33.11 1.2.16 2.18.16 2.94 0 7.39-2.77 14.42-8.31 21.08-5.54 6.66-12.08 10.68-19.62 12.06-.11-1.09-.16-1.95-.16-2.58z"/>
      </svg>
    );
    label = 'Apple TV+';
    badgeClass = 'badge-stream badge-stream-appletv';
  } else if (lower.includes('prime') || lower.includes('amazon')) {
    icon = (
      <svg width="11" height="10" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
        <path d="M3 13.5C7.5 17 16.5 17 21 12" stroke="#00A8E1" strokeWidth="2.4" strokeLinecap="round"/>
        <path d="M18.5 10.5L21.5 12L19.5 14.5" stroke="#00A8E1" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    );
    label = 'Prime';
    badgeClass = 'badge-stream badge-stream-prime';
  } else if (lower.includes('disney')) {
    icon = (
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
        <path d="M3 19C7 7 15 5 21 14" stroke="#4B72FF" strokeWidth="2.5" strokeLinecap="round"/>
        <path d="M19 8V12M17 10H21" stroke="#4B72FF" strokeWidth="2.2" strokeLinecap="round"/>
      </svg>
    );
    label = 'Disney+';
    badgeClass = 'badge-stream badge-stream-disney';
  } else if (lower.includes('mubi')) {
    icon = (
      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
        <circle cx="4" cy="12" r="2.5"/>
        <circle cx="9.3" cy="7" r="2.5"/>
        <circle cx="14.7" cy="12" r="2.5"/>
        <circle cx="20" cy="7" r="2.5"/>
      </svg>
    );
    label = 'MUBI';
    badgeClass = 'badge-stream badge-stream-mubi';
  } else if (lower.includes('max') || lower.includes('hbo')) {
    icon = <span style={{ fontWeight: 900, fontSize: 8.5, letterSpacing: -0.3, color: '#ce93d8', marginRight: 1 }}>MAX</span>;
    label = '';
    badgeClass = 'badge-stream badge-stream-max';
  } else if (lower.includes('ert')) {
    icon = <span style={{ fontWeight: 800, fontSize: 8.5, color: '#4fc3f7', marginRight: 1 }}>ERT</span>;
    label = 'FLIX';
    badgeClass = 'badge-stream badge-stream-ertflix';
  } else {
    icon = <span>📺</span>;
  }

  return (
    <span className={`badge ${badgeClass}`} title={tooltip}>
      {icon}
      {label && <span>{label}</span>}
      {extra && <span className="badge-stream-extra">{extra}</span>}
    </span>
  );
}

export default function MovieCard({ movie, onClick, listView = false, scoreMode = 'fair', onWatchlistToggle }) {
  const { voters, minVoters } = useAppConfig();
  const { id, title, director, year, runtime, mn, watchlist, rank_global, mn_rank, ratings, top3, fairBoosted, voterCount, imdb_rating, imdb_id, letterboxd_rating, poster_path, stream_gr, otherRatings, originalsScore, originalsBoostedScore, originalsVoterCount, originalsMn } = movie;

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
    return (
      <article className={cardClass} onClick={onClick} {...keyProps}>
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

        <div className="card-badges">
          {mn          && <span className="badge badge-mn">MN{mn_rank ? ` #${mn_rank}` : ''}</span>}
          <WatchlistBadge id={id} watchlist={watchlist} onToggle={onWatchlistToggle} />
          {rank_global && <span className="badge badge-ranked">#{rank_global}</span>}
          <StreamBadge streamGr={stream_gr} />
        </div>

        <div className="card-ratings">
          <VoterPills movieId={id} title={title} ratings={ratings} top3={top3} voters={voters} />
          {LetterboxdBadge}
          <OriginalsCompanionPill
            originalsScore={originalsScore}
            originalsBoostedScore={originalsBoostedScore}
            scoreMode={scoreMode}
            originalsVoterCount={originalsVoterCount}
            otherRatings={otherRatings}
            originalsMn={originalsMn}
          />
        </div>
      </article>
    );
  }

  const hasBadges = Boolean(mn || watchlist || rank_global || onWatchlistToggle || stream_gr);
  const hasOtherRatings = Boolean(originalsScore != null || (otherRatings && Object.keys(otherRatings).length > 0));
  const hasVoterRatings = Boolean(voters && voters.some(v => ratings?.[v] != null));
  const hasRatingsOrLb = Boolean(hasVoterRatings || hasOtherRatings || imdb_id || letterboxd_rating != null);

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
            <StreamBadge streamGr={stream_gr} />
          </div>
        )}

        {hasRatingsOrLb && (
          <div className="card-ratings">
            {hasVoterRatings && (
              <VoterPills movieId={id} title={title} ratings={ratings} top3={top3} voters={voters} />
            )}
            {LetterboxdBadge}
            <OriginalsCompanionPill
              originalsScore={originalsScore}
              originalsBoostedScore={originalsBoostedScore}
              scoreMode={scoreMode}
              originalsVoterCount={originalsVoterCount}
              otherRatings={otherRatings}
              originalsMn={originalsMn}
            />
          </div>
        )}
      </div>
    </article>
  );
}
