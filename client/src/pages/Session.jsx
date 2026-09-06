import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../api';
import { useAppConfig } from '../AppConfigContext';
import { formatRuntime, posterUrl, fmtScore10 as fmt, scoreClass } from '../utils';
import MovieModal from '../components/MovieModal';
import './Session.css';

// Palette of distinct cinematic hues for the wheel slices
const WHEEL_COLORS = [
  '#e50914', '#e67e22', '#16a085', '#2980b9', '#8e44ad',
  '#d35400', '#27ae60', '#f39c12', '#2c3e50', '#c0392b',
  '#009688', '#3f51b5', '#673ab7', '#e91e63', '#00bcd4'
];

const DURATION_OPTIONS = [
  { id: 'any', label: 'Any Duration', min: null, max: null },
  { id: 'short', label: '< 90m (Brisk)', min: null, max: 90 },
  { id: 'medium', label: '< 105m (< 1h 45m)', min: null, max: 105 },
  { id: 'standard', label: '< 120m (< 2h)', min: null, max: 120 },
  { id: 'epic', label: '120m+ (Epic)', min: 120, max: null },
];

function playTickSound(audioCtx) {
  if (!audioCtx) return;
  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(580, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(70, audioCtx.currentTime + 0.035);
    gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.035);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.035);
  } catch (e) {}
}

function playWinSound(audioCtx) {
  if (!audioCtx) return;
  try {
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime + i * 0.1);
      gain.gain.setValueAtTime(0.2, audioCtx.currentTime + i * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + i * 0.1 + 0.35);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(audioCtx.currentTime + i * 0.1);
      osc.stop(audioCtx.currentTime + i * 0.1 + 0.35);
    });
  } catch (e) {}
}

// Confetti particle system on canvas
class ConfettiSystem {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.animId = null;
  }

  start() {
    this.particles = [];
    const colors = ['#e50914', '#f1c40f', '#2ecc71', '#3498db', '#9b59b6', '#ffffff'];
    const count = 120;
    const w = this.canvas.width;
    const h = this.canvas.height;

    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: w / 2,
        y: h / 2,
        vx: (Math.random() - 0.5) * 16,
        vy: (Math.random() - 0.8) * 16,
        size: Math.random() * 7 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * 360,
        vr: (Math.random() - 0.5) * 15,
        opacity: 1,
        gravity: 0.28,
      });
    }

    const animate = () => {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      let alive = false;

      for (const p of this.particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += p.gravity;
        p.rotation += p.vr;
        p.opacity -= 0.008;

        if (p.opacity > 0) {
          alive = true;
          this.ctx.save();
          this.ctx.translate(p.x, p.y);
          this.ctx.rotate((p.rotation * Math.PI) / 180);
          this.ctx.fillStyle = p.color;
          this.ctx.globalAlpha = Math.max(0, p.opacity);
          this.ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
          this.ctx.restore();
        }
      }

      if (alive) {
        this.animId = requestAnimationFrame(animate);
      } else {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      }
    };

    if (this.animId) cancelAnimationFrame(this.animId);
    this.animId = requestAnimationFrame(animate);
  }

  stop() {
    if (this.animId) cancelAnimationFrame(this.animId);
    if (this.ctx) this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}

export default function Session({ voter }) {
  const { voters: configVoters } = useAppConfig();

  // Attendees state: defaults to all config voters
  const [attendees, setAttendees] = useState(configVoters || []);
  const [pool, setPool] = useState('watchlist'); // 'watchlist' | 'unwatched' | 'list'
  const [customLists, setCustomLists] = useState([]);
  const [selectedListId, setSelectedListId] = useState('');
  const [historyMode, setHistoryMode] = useState('fresh'); // 'fresh' | 'share' | 'all'
  const [durationFilter, setDurationFilter] = useState('any');
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Contenders state from backend
  const [contenders, setContenders] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [meta, setMeta] = useState(null);

  // Wheel state
  const [isSpinning, setIsSpinning] = useState(false);
  const [winner, setWinner] = useState(null);
  const [detailMovieId, setDetailMovieId] = useState(null);

  // Canvas refs
  const canvasRef = useRef(null);
  const confettiCanvasRef = useRef(null);
  const confettiRef = useRef(null);
  const audioCtxRef = useRef(null);
  const currentAngleRef = useRef(0);
  const animFrameRef = useRef(null);
  const lastTickSliceRef = useRef(-1);

  // Ensure attendees synchronize if configVoters change
  useEffect(() => {
    if (configVoters && configVoters.length > 0 && attendees.length === 0) {
      setAttendees(configVoters);
    }
  }, [configVoters]);

  // Load available custom lists
  useEffect(() => {
    api.getLists().then(lists => {
      setCustomLists(lists || []);
      if (lists && lists.length > 0 && !selectedListId) {
        setSelectedListId(lists[0].id);
      }
    }).catch(() => {});
  }, []);

  // Fetch contenders when filters change
  const fetchContenders = useCallback(async () => {
    if (attendees.length === 0) {
      setContenders([]);
      setSelectedIds(new Set());
      setMeta(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    const dur = DURATION_OPTIONS.find(d => d.id === durationFilter) || DURATION_OPTIONS[0];

    try {
      const res = await api.getSessionContenders({
        attendees,
        pool,
        listId: pool === 'list' ? selectedListId : undefined,
        historyMode,
        minRuntime: dur.min,
        maxRuntime: dur.max,
        limit: 16,
      });

      // If watchlist is empty, auto-fallback recommendation
      if (res.meta?.isWatchlistEmpty && pool === 'watchlist') {
        setPool('all');
        return;
      }

      setContenders(res.contenders || []);
      setMeta(res.meta || null);
      // Default: select up to top 8 contenders on the wheel
      const initialSelected = new Set((res.contenders || []).slice(0, 8).map(c => c.id));
      setSelectedIds(initialSelected);
    } catch (err) {
      setError(err.message || 'Failed to load session contenders');
    } finally {
      setLoading(false);
    }
  }, [attendees, pool, selectedListId, historyMode, durationFilter]);

  useEffect(() => {
    fetchContenders();
  }, [fetchContenders]);

  // Contenders currently active on the wheel
  const activeContenders = contenders.filter(c => selectedIds.has(c.id));

  // Initialize confetti canvas
  useEffect(() => {
    if (confettiCanvasRef.current) {
      confettiRef.current = new ConfettiSystem(confettiCanvasRef.current);
    }
    return () => {
      if (confettiRef.current) confettiRef.current.stop();
    };
  }, []);

  // Audio Context initializer on user interaction
  const getAudioContext = useCallback(() => {
    if (!soundEnabled) return null;
    if (!audioCtxRef.current) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) audioCtxRef.current = new AudioCtx();
    }
    if (audioCtxRef.current?.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, [soundEnabled]);

  // Draw the Roulette Wheel on Canvas
  const drawWheel = useCallback((angle) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(centerX, centerY) - 16;

    ctx.clearRect(0, 0, width, height);

    const n = activeContenders.length;
    if (n === 0) {
      // Empty wheel placeholder
      ctx.save();
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
      ctx.fillStyle = '#1e2430';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 4;
      ctx.stroke();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.font = '600 15px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Select at least 2 contenders', centerX, centerY);
      ctx.restore();
      return;
    }

    const sliceAngle = (2 * Math.PI) / n;

    // Draw outer glow/ring
    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius + 5, 0, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.restore();

    // Draw Slices
    for (let i = 0; i < n; i++) {
      const movie = activeContenders[i];
      const startAngle = angle + i * sliceAngle;
      const endAngle = startAngle + sliceAngle;
      const sliceColor = WHEEL_COLORS[i % WHEEL_COLORS.length];

      // Slice sector
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = sliceColor;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Slice text (Movie Title & Duration)
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(startAngle + sliceAngle / 2);

      ctx.textAlign = 'right';
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
      ctx.shadowBlur = 4;

      const titleFontSize = n > 10 ? 11 : (n > 6 ? 12 : 14);
      ctx.font = `700 ${titleFontSize}px system-ui, -apple-system, sans-serif`;

      let displayTitle = movie.title;
      const maxLen = n > 8 ? 16 : 22;
      if (displayTitle.length > maxLen) {
        displayTitle = displayTitle.slice(0, maxLen - 1) + '…';
      }

      // Draw title text
      ctx.fillText(displayTitle, radius - 24, 4);

      // Duration or Match Score pill if room allows
      if (n <= 8 && movie.runtime) {
        ctx.font = '500 10px system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.fillText(formatRuntime(movie.runtime), radius - 24, 18);
      }

      ctx.restore();
      ctx.restore();
    }

    // Outer rim & bulb studs
    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    ctx.strokeStyle = '#222834';
    ctx.lineWidth = 10;
    ctx.stroke();

    // Brass/gold decorative rim
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius - 4, 0, 2 * Math.PI);
    ctx.strokeStyle = '#e2b342';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Center Hub (wheel axis)
    ctx.beginPath();
    ctx.arc(centerX, centerY, 38, 0, 2 * Math.PI);
    ctx.fillStyle = '#161a22';
    ctx.fill();
    ctx.strokeStyle = '#e2b342';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = '700 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SPIN', centerX, centerY);
    ctx.restore();

    // Top Pointer / Ticker Arrow (at 12 o'clock, pointing down)
    ctx.save();
    const ptrY = centerY - radius;
    ctx.fillStyle = '#e50914';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 6;

    ctx.beginPath();
    ctx.moveTo(centerX, ptrY + 22); // pointed tip downwards
    ctx.lineTo(centerX - 14, ptrY - 10);
    ctx.lineTo(centerX + 14, ptrY - 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

  }, [activeContenders]);

  // Redraw wheel whenever active contenders change or wheel mounts
  useEffect(() => {
    drawWheel(currentAngleRef.current);
  }, [drawWheel]);

  // Spin the Wheel Animation with Physics & Ticking Sound
  const handleSpin = () => {
    const n = activeContenders.length;
    if (n < 1 || isSpinning) return;

    if (n === 1) {
      setWinner(activeContenders[0]);
      if (confettiRef.current) confettiRef.current.start();
      const ctx = getAudioContext();
      playWinSound(ctx);
      return;
    }

    const audioCtx = getAudioContext();
    setIsSpinning(true);
    setWinner(null);
    if (confettiRef.current) confettiRef.current.stop();

    // Pick a winner randomly
    const winningIndex = Math.floor(Math.random() * n);
    const sliceAngle = (2 * Math.PI) / n;

    // The pointer is at 12 o'clock (angle: -π/2 or 3π/2)
    // To land winningIndex under the pointer:
    // pointerAngle = -π/2
    // wheelAngle + winningIndex * sliceAngle + sliceAngle / 2 = -π/2 (mod 2π)
    const targetOffset = -Math.PI / 2 - (winningIndex * sliceAngle + sliceAngle / 2);
    const extraRotations = (6 + Math.floor(Math.random() * 4)) * 2 * Math.PI;
    const finalAngle = targetOffset + extraRotations;

    const startAngle = currentAngleRef.current;
    const deltaAngle = finalAngle - (startAngle % (2 * Math.PI));
    const duration = 4800; // ms
    const startTime = performance.now();

    lastTickSliceRef.current = -1;

    const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);

    const animate = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      const eased = easeOutQuart(progress);
      const angle = startAngle + deltaAngle * eased;

      currentAngleRef.current = angle;
      drawWheel(angle);

      // Calculate slice currently under pointer for tick sound
      const norm = ((-Math.PI / 2 - angle) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
      const currentSlice = Math.floor(norm / sliceAngle);

      if (currentSlice !== lastTickSliceRef.current) {
        lastTickSliceRef.current = currentSlice;
        playTickSound(audioCtx);
      }

      if (progress < 1) {
        animFrameRef.current = requestAnimationFrame(animate);
      } else {
        // Finished spin
        setIsSpinning(false);
        const chosen = activeContenders[winningIndex];
        setWinner(chosen);
        playWinSound(audioCtx);
        if (confettiRef.current) confettiRef.current.start();
      }
    };

    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = requestAnimationFrame(animate);
  };

  // Toggle voter attendance
  const toggleAttendee = (voterName) => {
    setAttendees(prev => {
      if (prev.includes(voterName)) {
        if (prev.length === 1) return prev; // Keep at least one
        return prev.filter(v => v !== voterName);
      }
      return [...prev, voterName];
    });
  };

  const selectAllAttendees = () => setAttendees(configVoters || []);

  // Toggle inclusion of contender on wheel
  const toggleContender = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectTopN = (n) => {
    const top = contenders.slice(0, n).map(c => c.id);
    setSelectedIds(new Set(top));
  };

  const removeWinnerAndSpin = () => {
    if (!winner) return;
    const nextIds = new Set(selectedIds);
    nextIds.delete(winner.id);
    setSelectedIds(nextIds);
    setWinner(null);
    if (confettiRef.current) confettiRef.current.stop();
  };

  return (
    <div className="session-page">
      {/* Page Header */}
      <header className="session-header">
        <div className="session-header-badge">🍿 Tonight's Movie Night</div>
        <h1 className="session-title">Session Planner & Wheel</h1>
        <p className="session-subtitle">
          Select who is in the room tonight, set your duration constraints, and let the wheel pick the film everyone will love!
        </p>
      </header>

      {/* Control Panel: Attendees & Filters */}
      <section className="session-controls">
        {/* Attendees Selector */}
        <div className="control-group">
          <div className="control-header">
            <span className="control-label">👥 Who is here tonight?</span>
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={selectAllAttendees}
              disabled={attendees.length === configVoters.length}
            >
              Select All ({configVoters.length})
            </button>
          </div>
          <div className="voter-chip-grid">
            {configVoters.map(v => {
              const isPresent = attendees.includes(v);
              return (
                <button
                  key={v}
                  type="button"
                  className={`attendee-chip ${isPresent ? 'active' : ''}`}
                  onClick={() => toggleAttendee(v)}
                  title={isPresent ? `Click to mark ${v} absent` : `Click to mark ${v} present`}
                >
                  <span className="attendee-indicator">{isPresent ? '✓' : '+'}</span>
                  <span className="attendee-name">{v}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Pool & Duration Filters */}
        <div className="session-filter-row">
          {/* Candidate Pool */}
          <div className="session-filter-col">
            <span className="session-filter-label">🎬 Candidate Pool</span>
            <div className="session-chip-group">
              <button
                type="button"
                className={`session-filter-chip ${pool === 'watchlist' ? 'active' : ''}`}
                onClick={() => setPool('watchlist')}
              >
                Watchlist {meta?.totalWatchlist != null ? `(${meta.totalWatchlist})` : ''}
              </button>
              <button
                type="button"
                className={`session-filter-chip ${pool === 'all' || pool === 'unwatched' ? 'active' : ''}`}
                onClick={() => setPool('all')}
              >
                All Films {meta?.totalMovies != null ? `(${meta.totalMovies})` : ''}
              </button>
              {customLists.length > 0 && (
                <button
                  type="button"
                  className={`session-filter-chip ${pool === 'list' ? 'active' : ''}`}
                  onClick={() => setPool('list')}
                >
                  Custom List
                </button>
              )}
            </div>

            {pool === 'list' && customLists.length > 0 && (
              <div className="list-select-wrapper">
                <select
                  className="input list-select"
                  value={selectedListId}
                  onChange={e => setSelectedListId(e.target.value)}
                >
                  {customLists.map(l => (
                    <option key={l.id} value={l.id}>
                      {l.title} ({l.film_count} films)
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Duration Chips */}
          <div className="session-filter-col">
            <span className="session-filter-label">⏱️ Duration / Runtime</span>
            <div className="session-chip-group">
              {DURATION_OPTIONS.map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  className={`session-filter-chip ${durationFilter === opt.id ? 'active' : ''}`}
                  onClick={() => setDurationFilter(opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Previous Watches Mode */}
          <div className="session-filter-col">
            <span className="session-filter-label">🔄 Previous Watches</span>
            <div className="session-chip-group">
              <button
                type="button"
                className={`session-filter-chip ${historyMode === 'fresh' ? 'active' : ''}`}
                onClick={() => setHistoryMode('fresh')}
                title="Only include films that none of the attendees in the room have rated (0 seen)"
              >
                🆕 Fresh (Unseen)
              </button>
              <button
                type="button"
                className={`session-filter-chip ${historyMode === 'share' ? 'active' : ''}`}
                onClick={() => setHistoryMode('share')}
                title="Share favorites: 1+ attendees have seen it, but someone in the room hasn't seen it yet"
              >
                👥 Share Favorites
              </button>
              <button
                type="button"
                className={`session-filter-chip ${historyMode === 'all' ? 'active' : ''}`}
                onClick={() => setHistoryMode('all')}
                title="All films allowed (including films seen by all attendees, with a re-watch discount)"
              >
                🔄 All Allowed
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Main Split Layout: Wheel & Ranked Contenders */}
      <div className="session-main-layout">
        {/* Left Column: Roulette Wheel */}
        <section className="session-wheel-section">
          <div className="wheel-card">
            <div className="wheel-header">
              <h2 className="wheel-heading">Roulette Wheel</h2>
              <div className="wheel-actions">
                <button
                  type="button"
                  className={`btn-sound-toggle ${soundEnabled ? 'active' : ''}`}
                  onClick={() => setSoundEnabled(s => !s)}
                  title={soundEnabled ? 'Mute wheel sound effects' : 'Enable wheel sound effects'}
                >
                  {soundEnabled ? '🔊 Sound On' : '🔇 Muted'}
                </button>
              </div>
            </div>

            {/* Canvas Wheel Area */}
            <div className="wheel-canvas-container" onClick={!isSpinning ? handleSpin : undefined}>
              <canvas
                ref={canvasRef}
                width={420}
                height={420}
                className={`wheel-canvas ${isSpinning ? 'spinning' : ''}`}
              />
              <canvas
                ref={confettiCanvasRef}
                width={420}
                height={420}
                className="confetti-canvas"
              />
            </div>

            {/* Spin CTA Button */}
            <div className="wheel-cta-wrap">
              <button
                type="button"
                className="btn btn-primary btn-spin"
                disabled={activeContenders.length === 0 || isSpinning}
                onClick={handleSpin}
              >
                {isSpinning ? (
                  <>
                    <span className="spinner-inline" /> Spinning...
                  </>
                ) : (
                  <>
                    🎲 SPIN FOR TONIGHT! ({activeContenders.length} films)
                  </>
                )}
              </button>

              <div className="wheel-selection-shortcuts">
                <button type="button" className="btn btn-ghost btn-xs" onClick={() => selectTopN(5)}>
                  Top 5
                </button>
                <button type="button" className="btn btn-ghost btn-xs" onClick={() => selectTopN(8)}>
                  Top 8
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  onClick={() => setSelectedIds(new Set(contenders.map(c => c.id)))}
                >
                  All ({contenders.length})
                </button>
                <button type="button" className="btn btn-ghost btn-xs" onClick={() => setSelectedIds(new Set())}>
                  Clear
                </button>
              </div>
            </div>

            {/* Winner Announcement Banner */}
            {winner && (
              <div className="winner-banner">
                <div className="winner-glow" />
                <div className="winner-header">🎉 Tonight's Pick!</div>
                <div className="winner-content" onClick={() => setDetailMovieId(winner.id)}>
                  {winner.poster_path && (
                    <img
                      src={posterUrl(winner.poster_path, 'w185')}
                      alt={winner.title}
                      className="winner-poster"
                    />
                  )}
                  <div className="winner-info">
                    <h3 className="winner-title">{winner.title}</h3>
                    <p className="winner-meta">
                      <span>{winner.director}</span>
                      {winner.year && <> · <span>{winner.year}</span></>}
                      {winner.runtime && <> · <span className="card-runtime">{formatRuntime(winner.runtime)}</span></>}
                    </p>
                    <div className="winner-score-row">
                      <span className={`score-badge ${scoreClass(winner.sessionScore)}`}>
                        {winner.sessionScore} / 10 Match
                      </span>
                      {winner.crowdPleaser && <span className="badge badge-crowd">🤝 High Agreement</span>}
                    </div>
                  </div>
                </div>

                <div className="winner-actions">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => setDetailMovieId(winner.id)}
                  >
                    View Movie Details
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={removeWinnerAndSpin}
                  >
                    Remove & Spin Again
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Right Column: Ranked Contenders List */}
        <section className="session-contenders-section">
          <div className="contenders-header">
            <div>
              <h2 className="contenders-heading">Ranked Contenders</h2>
              <span className="contenders-sub">
                {loading
                  ? 'Calculating consensus...'
                  : `${contenders.length} candidate films scored for tonight`}
              </span>
            </div>
            {meta?.pool && (
              <span className="pool-badge">
                Pool: {pool === 'watchlist' ? 'Watchlist' : (pool === 'list' ? 'Custom List' : 'All Films')}
              </span>
            )}
          </div>

          {loading ? (
            <div className="session-loading">
              <div className="spinner" />
              <p>Analyzing attendee tastes, directors & durations...</p>
            </div>
          ) : error ? (
            <div className="session-error">
              <span>⚠️ {error}</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={fetchContenders}>
                Try Again
              </button>
            </div>
          ) : contenders.length === 0 ? (
            <div className="session-empty">
              <span className="empty-icon">🎞</span>
              <h3>No candidate films found</h3>
              <p>Try selecting a different pool or duration filter.</p>
              {pool === 'watchlist' && (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => setPool('all')}
                >
                  Explore All Films
                </button>
              )}
            </div>
          ) : (
            <div className="contenders-list">
              {contenders.map((movie, idx) => {
                const isSelected = selectedIds.has(movie.id);
                return (
                  <div
                    key={movie.id}
                    className={`contender-card ${isSelected ? 'selected' : ''}`}
                    onClick={() => setDetailMovieId(movie.id)}
                  >
                    {/* Checkbox to include on the wheel */}
                    <div
                      className="contender-checkbox-wrap"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleContender(movie.id);
                      }}
                      title={isSelected ? 'Remove from wheel' : 'Add to wheel'}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        aria-label={`Include ${movie.title} on wheel`}
                      />
                    </div>

                    {/* Rank Number */}
                    <div className="contender-rank">#{idx + 1}</div>

                    {/* Poster */}
                    <div className="contender-poster">
                      {movie.poster_path ? (
                        <img src={posterUrl(movie.poster_path, 'w92')} alt="" loading="lazy" />
                      ) : (
                        <span className="contender-poster-empty">🎬</span>
                      )}
                    </div>

                    {/* Info */}
                    <div className="contender-info">
                      <div className="contender-title-row">
                        <span className="contender-title" title={movie.title}>{movie.title}</span>
                        <span className={`contender-score ${scoreClass(movie.sessionScore)}`}>
                          {fmt(movie.sessionScore)}
                        </span>
                      </div>

                      <div className="contender-meta">
                        <span className="contender-director">{movie.director}</span>
                        {movie.year && <> · <span>{movie.year}</span></>}
                        {movie.runtime && (
                          <> · <span className="card-runtime">{formatRuntime(movie.runtime)}</span></>
                        )}
                      </div>

                      {/* Attendee Predicted Scores Breakdown */}
                      <div className="attendee-breakdown-row">
                        {movie.attendeeBreakdown?.map(a => (
                          <span
                            key={a.voter}
                            className={`attendee-score-pill ${scoreClass(a.predictedScore)}${a.isRated ? ' is-rated' : ''}`}
                            title={`${a.voter} ${a.isRated ? 'already rated' : 'predicted'}: ${a.predictedScore}${a.onWatchlist ? ' (on watchlist)' : ''}${a.hasTop10 ? ' (favorite director)' : ''}`}
                          >
                            <span className="pill-name">{a.voter.slice(0, 3)}</span>
                            <span className="pill-val">{a.isRated ? `★ ${a.predictedScore}` : a.predictedScore}</span>
                          </span>
                        ))}
                        {movie.isRewatch && (
                          <span
                            className={`signal-badge ${movie.isAllSeen ? 'all-seen-badge' : 'share-badge'}`}
                            title={movie.isAllSeen ? `All ${movie.seenCount} attendees have seen this before` : `${movie.seenCount} of ${attendees.length} attendees have seen this (new to ${attendees.length - movie.seenCount})`}
                          >
                            {movie.isAllSeen ? `🔄 Re-watch (${movie.seenCount}/${attendees.length})` : `👥 Share (${movie.seenCount}/${attendees.length} seen)`}
                          </span>
                        )}
                        {movie.crowdPleaser && (
                          <span className="signal-badge" title="Very close ratings predicted across all attendees">
                            🤝 Harmony
                          </span>
                        )}
                        {movie.unanimousWatchlist && (
                          <span className="signal-badge wl-unanimous" title="All attendees voted for this on watchlist">
                            ⭐ Unanimous
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Detail MovieModal on tap */}
      {detailMovieId && (
        <MovieModal
          movieId={detailMovieId}
          onClose={() => setDetailMovieId(null)}
          onSaved={() => fetchContenders()}
          onDeleted={() => {
            setDetailMovieId(null);
            fetchContenders();
          }}
        />
      )}
    </div>
  );
}
