import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api';
import './RatingHistory.css';

// A rating is a value that *holds* until someone changes it — it isn't sampled
// over time. So every chart here is stepped: interpolating between 7.0 and 6.0
// would draw a 6.5 in mid-July that nobody ever gave.

// History can't ride along with the film list (834 films, an unbounded table),
// so it's fetched per film on first hover and kept for the session.
const cache = new Map();

function fetchHistory(movieId) {
  if (!cache.has(movieId)) {
    cache.set(movieId, api.getMovieHistory(movieId).catch(err => {
      cache.delete(movieId); // let a failed fetch be retried on the next hover
      throw err;
    }));
  }
  return cache.get(movieId);
}

/** Loads one film's history, only once `enabled` turns true. */
export function useRatingHistory(movieId, enabled) {
  const [state, setState] = useState({ loading: false, data: null });

  useEffect(() => {
    if (!enabled || !movieId) return;
    let live = true;
    setState(s => (s.data ? s : { loading: true, data: null }));
    fetchHistory(movieId)
      .then(data => { if (live) setState({ loading: false, data }); })
      .catch(() => { if (live) setState({ loading: false, data: {} }); });
    return () => { live = false; };
  }, [movieId, enabled]);

  return state;
}

/** Splits a voter's raw history rows into score events and Top 10 events. */
export function splitEvents(rows = []) {
  const scores = [];
  const picks = [];
  for (const row of rows) {
    const at = new Date(row.changedAt.replace(' ', 'T') + 'Z').getTime();
    if (row.kind === 'top10') picks.push({ at, rank: row.rank, source: row.source });
    else scores.push({ at, value: row.score, source: row.source });
  }
  scores.sort((a, b) => a.at - b.at);
  picks.sort((a, b) => a.at - b.at);
  return { scores, picks };
}

/** Net change and revision count for the summary line. */
export function summarise(scores) {
  const real = scores.filter(e => e.value != null);
  if (real.length === 0) return null;
  const first = real[0].value;
  const last = real[real.length - 1].value;
  return { first, last, delta: Math.round((last - first) * 10) / 10, changes: real.length - 1 };
}

/**
 * Stepped score chart. `full` locks the y-axis to 0–10 so a one-point drop
 * looks like a one-point drop; otherwise it auto-scales with a ±0.5 pad, which
 * is what makes a small move readable at popover size.
 */
export function StepChart({ scores, picks = [], width, height, full = false, axis = false }) {
  const real = scores.filter(e => e.value != null);
  if (real.length === 0) return null;

  const padLeft = axis ? 26 : 6;
  const padRight = 6;
  const padTop = 8;
  const padBottom = axis ? 22 : 10;

  const values = real.map(e => e.value);
  const lo = full ? 0 : Math.max(0, Math.min(...values) - 0.5);
  const hi = full ? 10 : Math.min(10, Math.max(...values) + 0.5);
  const span = hi - lo || 1;

  const start = real[0].at;
  const now = Date.now();
  const end = Math.max(now, real[real.length - 1].at);
  const range = end - start || 1;

  const x = (at) => padLeft + ((at - start) / range) * (width - padLeft - padRight);
  const y = (value) => padTop + (1 - (value - lo) / span) * (height - padTop - padBottom);

  // Build one path per unbroken run — a cleared rating ends a run rather than
  // drawing a line across the gap.
  const runs = [];
  let run = [];
  for (const event of scores) {
    if (event.value == null) { if (run.length) runs.push(run); run = []; continue; }
    run.push(event);
  }
  if (run.length) runs.push(run);

  const paths = runs.map((events, index) => {
    const isLast = index === runs.length - 1;
    let d = `M${x(events[0].at)},${y(events[0].value)}`;
    for (let i = 1; i < events.length; i++) {
      d += ` L${x(events[i].at)},${y(events[i - 1].value)} L${x(events[i].at)},${y(events[i].value)}`;
    }
    if (isLast) d += ` L${x(end)},${y(events[events.length - 1].value)}`;
    return d;
  });

  const last = real[real.length - 1];
  const rising = last.value >= real[0].value;
  const stroke = rising ? 'var(--green)' : 'var(--red)';
  const baseline = height - padBottom;
  const areaPath = `${paths[paths.length - 1]} L${x(end)},${baseline} L${x(runs[runs.length - 1][0].at)},${baseline} Z`;

  const gridValues = full ? [10, 8, 6, 4, 2] : [hi, lo];

  return (
    <svg
      className="rh-chart"
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Score history: ${real[0].value} to ${last.value}`}
    >
      {gridValues.map(value => (
        <g key={value}>
          <line
            x1={padLeft} y1={y(value)} x2={width - padRight} y2={y(value)}
            stroke="var(--border)" strokeDasharray={full ? undefined : '2 3'}
          />
          {axis && (
            <text x={padLeft - 5} y={y(value) + 3} className="rh-axis-label" textAnchor="end">{value}</text>
          )}
        </g>
      ))}

      <path d={areaPath} fill={stroke} opacity="0.09" />
      {paths.map((d, i) => (
        <path key={i} d={d} fill="none" stroke={stroke} strokeWidth={axis ? 2.5 : 2} strokeLinejoin="round" strokeLinecap="round" />
      ))}

      <circle cx={x(real[0].at)} cy={y(real[0].value)} r={axis ? 3.5 : 2.4} fill="var(--text3)" />
      <circle cx={x(end)} cy={y(last.value)} r={axis ? 4 : 3} fill={stroke} />

      {picks.filter(p => p.rank != null && p.at >= start).map((pick, i) => {
        // A Top 10 marker sits on the line at the moment the pick happened —
        // the score at that time, not the current one.
        const at = Math.min(Math.max(pick.at, start), end);
        const held = real.filter(e => e.at <= at).pop() || real[0];
        const size = axis ? 8 : 6;
        return (
          <rect
            key={i}
            x={x(at) - size / 2} y={y(held.value) - size / 2}
            width={size} height={size} fill="var(--gold)"
            transform={`rotate(45 ${x(at)} ${y(held.value)})`}
          >
            <title>{`Top 10 · #${pick.rank}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

function formatDay(at) {
  return new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** The small graph that floats off a voter pill. */
export function HistoryPopover({ voter, rows, loading, anchor, onOpen, onHoverEnter, onHoverLeave }) {
  const { scores, picks } = splitEvents(rows);
  const summary = summarise(scores);

  const style = { left: anchor.left, top: anchor.top };
  if (anchor.flipX) { style.left = 'auto'; style.right = anchor.right; }
  if (anchor.flipY) { style.top = 'auto'; style.bottom = anchor.bottom; }

  return createPortal(
    // Portalled out of the card, so it needs its own hover handlers: without
    // them, the pointer travelling from the pill into the popover reads as a
    // mouseleave on the pill and closes the thing you're reaching for.
    <div
      className="rh-pop"
      style={style}
      role="dialog"
      aria-label={`${voter} rating history`}
      onMouseEnter={onHoverEnter}
      onMouseLeave={onHoverLeave}
      onClick={e => e.stopPropagation()}
    >
      <div className="rh-pop-head">
        <span className="rh-pop-voter">{voter}</span>
        {summary && summary.changes > 0 && (
          <span className={`rh-delta ${summary.delta >= 0 ? 'up' : 'down'}`}>
            {summary.first} → {summary.last}
          </span>
        )}
      </div>

      {loading && <div className="rh-skeleton" />}

      {!loading && !summary && <div className="rh-empty">No history yet</div>}

      {!loading && summary && (
        <>
          <StepChart scores={scores} picks={picks} width={182} height={52} />
          <div className="rh-pop-x">
            <span>{formatDay(scores[0].at)}</span>
            <span>today</span>
          </div>
          <div className="rh-pop-foot">
            <span>{summary.changes === 0 ? 'never changed' : `${summary.changes} change${summary.changes === 1 ? '' : 's'}`}</span>
            <button type="button" className="rh-more" onClick={onOpen}>Detail ›</button>
          </div>
        </>
      )}
    </div>,
    document.body
  );
}

/** The detail window a click opens — full 0–10 axis, dated, with Top 10 markers. */
export function HistoryWindow({ title, voter, rows, onClose }) {
  const { scores, picks } = splitEvents(rows);
  const summary = summarise(scores);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    // Capture phase so this closes before MovieModal's own Escape handler when
    // the window was opened from inside the modal.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return createPortal(
    <div className="rh-backdrop" onClick={onClose}>
      <div className="rh-win" onClick={e => e.stopPropagation()} role="dialog" aria-label={`${voter} rating history for ${title}`}>
        <div className="rh-win-bar">
          <div>
            <div className="rh-win-title">{voter} · {title}</div>
            <div className="rh-win-sub">Rating history</div>
          </div>
          <button type="button" className="rh-win-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="rh-win-body">
          {summary ? (
            <>
              <StepChart scores={scores} picks={picks} width={348} height={168} full axis />
              <div className="rh-win-x">
                <span>{formatDay(scores[0].at)}</span>
                <span>today</span>
              </div>
              <div className="rh-win-stats">
                <div className="rh-stat"><span className="k">Now</span><span className="v">{summary.last}</span></div>
                <div className="rh-stat">
                  <span className="k">Net</span>
                  <span className={`v ${summary.delta > 0 ? 'up' : summary.delta < 0 ? 'down' : ''}`}>
                    {summary.delta > 0 ? '+' : ''}{summary.delta}
                  </span>
                </div>
                <div className="rh-stat"><span className="k">Changes</span><span className="v">{summary.changes}</span></div>
              </div>
              {picks.length > 0 && (
                <div className="rh-legend"><i />Top 10 movement</div>
              )}
              {scores.some(e => e.source === 'backfill') && (
                <p className="rh-note">
                  Points before today's app were reconstructed from the nightly database
                  snapshots, so they are accurate to the day, not the minute.
                </p>
              )}
            </>
          ) : (
            <div className="rh-empty">No history recorded yet.</div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

/** Positions a popover against a pill, flipping near the viewport edges. */
export function useAnchor(element) {
  const [anchor, setAnchor] = useState(null);

  useEffect(() => {
    if (!element) { setAnchor(null); return; }
    const measure = () => {
      const rect = element.getBoundingClientRect();
      if (!rect) return;
      const flipX = rect.left + 220 > window.innerWidth;
      const flipY = rect.bottom + 130 > window.innerHeight;
      setAnchor({
        left: rect.left,
        top: rect.bottom + 6,
        right: Math.max(8, window.innerWidth - rect.right),
        bottom: Math.max(8, window.innerHeight - rect.top + 6),
        flipX,
        flipY,
      });
    };
    measure();
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [element]);

  return anchor;
}

/**
 * Hover intent: opens after a pause so sweeping the mouse across a grid of
 * cards doesn't strobe, and closes on a grace period so the pointer can travel
 * from the pill into the popover without it vanishing.
 */
export function useHoverIntent(openDelay = 180, closeDelay = 120) {
  const timer = useRef(null);
  const clear = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };

  useEffect(() => clear, []);

  return {
    enter: (fn) => { clear(); timer.current = setTimeout(fn, openDelay); },
    leave: (fn) => { clear(); timer.current = setTimeout(fn, closeDelay); },
    cancel: clear,
  };
}
