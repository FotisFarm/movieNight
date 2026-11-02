import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { api } from '../api';
import { useAppConfig } from '../AppConfigContext';
import UserAvatar from '../components/UserAvatar';
import { RECAP_PRESETS, getRecapLabel } from '../components/Header';
import './Recap.css';

export default function Recap({ voter, user }) {
  const { activeGroup, recap } = useAppConfig() || {};
  const [mode, setMode] = useState('story'); // 'story' | 'dossier'
  const [scope, setScope] = useState('mn'); // 'mn' | 'all'
  const [year, setYear] = useState(recap?.year || '2026');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Story Mode State
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(0); // 0 to 100
  const progressTimerRef = useRef(null);

  // Share Modal State
  const [showShareModal, setShowShareModal] = useState(false);
  const [copied, setCopied] = useState(false);

  const recapInfo = getRecapLabel(recap);

  // Fetch recap data whenever group, year, or scope changes
  const loadRecap = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await api.getRecap({ year, scope });
      setData(res);
      setCurrentSlideIndex(0);
      setProgress(0);
    } catch (err) {
      console.error('Failed to load recap:', err);
      setError(err.message || 'Recap is not currently available');
    } finally {
      setLoading(false);
    }
  }, [year, scope, activeGroup?.id]);

  useEffect(() => {
    loadRecap();
  }, [loadRecap]);

  // Current voter profile within the group
  const myVoterProfile = useMemo(() => {
    if (!data?.voters || !voter) return null;
    return data.voters.find(v => v.voter === voter) || null;
  }, [data, voter]);

  // Build Story Slides dynamically based on available data
  const storySlides = useMemo(() => {
    if (!data || data.empty || !data.groupStats) return [];
    const gs = data.groupStats;
    const slides = [];

    // 1. Welcome Intro
    slides.push({
      id: 'welcome',
      tagline: 'Year in Review',
      headline: `${data.year === 'all' ? 'All-Time' : data.year} Wrapped`,
      pill: '🎬 The Journey',
      icon: '🍿',
      title: data.group.name,
      sub: `${data.year === 'all' ? 'All-Time Screenings' : `The Story of ${data.year}`}`,
      statNum: String(gs.totalFilms),
      statLabel: `${scope === 'mn' ? 'Movie Night Screenings' : 'Total Rated Films'}`,
      bottomPill: `${gs.totalScreenHours} Screen Hours · Group Avg ${gs.groupMeanScore}`,
    });

    // 2. Film of the Year
    if (gs.filmOfTheYear) {
      slides.push({
        id: 'film_of_year',
        tagline: 'The Crowning Achievement',
        headline: 'Film of the Year',
        pill: '🏆 Champion',
        icon: '👑',
        title: `${gs.filmOfTheYear.title} (${gs.filmOfTheYear.year || ''})`,
        sub: `Directed by ${gs.filmOfTheYear.director || 'Unknown'}`,
        statNum: String(gs.filmOfTheYear.meanScore),
        statLabel: `Highest Consensus Score (${gs.filmOfTheYear.count} votes)`,
        backdropUrl: gs.filmOfTheYear.backdropUrl || gs.filmOfTheYear.posterUrl,
      });
    }

    // 3. Unanimous Peace
    if (gs.unanimousPeace) {
      slides.push({
        id: 'unanimous_peace',
        tagline: 'The Harmony Award',
        headline: 'Unanimous Peace',
        pill: '🕊️ Agreement',
        icon: '🕊️',
        title: `${gs.unanimousPeace.title} (${gs.unanimousPeace.year || ''})`,
        sub: `Standard Deviation ±${gs.unanimousPeace.stdDev}`,
        statNum: String(gs.unanimousPeace.meanScore),
        statLabel: 'Lowest Room Controversy',
        pills: Object.entries(gs.unanimousPeace.ratingsDict || gs.unanimousPeace.scores || {}).map(([v, s]) => `${v}: ${s}`),
        backdropUrl: gs.unanimousPeace.backdropUrl || gs.unanimousPeace.posterUrl,
      });
    }

    // 4. Civil War
    if (gs.civilWar) {
      const div = gs.civilWar.divergence;
      slides.push({
        id: 'civil_war',
        tagline: 'The Battlefield',
        headline: 'Civil War',
        pill: '⚔️ Polarization',
        icon: '⚔️',
        title: `${gs.civilWar.title} (${gs.civilWar.year || ''})`,
        sub: `Standard Deviation ±${gs.civilWar.stdDev} (Most Divisive)`,
        statNum: div ? `${div.highScore} vs ${div.lowScore}` : `±${gs.civilWar.stdDev}`,
        statLabel: div ? `${div.highVoter} (${div.highScore}) vs ${div.lowVoter} (${div.lowScore})` : 'Score Gap',
        pills: Object.entries(gs.civilWar.ratingsDict || gs.civilWar.scores || {}).map(([v, s]) => `${v}: ${s}`),
        backdropUrl: gs.civilWar.backdropUrl || gs.civilWar.posterUrl,
      });
    }

    // 5. Hidden Gem
    if (gs.hiddenGem) {
      slides.push({
        id: 'hidden_gem',
        tagline: 'The Sleeper Hit',
        headline: 'Hidden Gem',
        pill: '💎 Sleeper',
        icon: '💎',
        title: `${gs.hiddenGem.title} (${gs.hiddenGem.year || ''})`,
        sub: 'Club rated much higher than Letterboxd',
        statNum: `+${gs.hiddenGem.diff ?? gs.hiddenGem.delta}`,
        statLabel: `Club ${gs.hiddenGem.meanScore} vs Letterboxd ${gs.hiddenGem.letterboxdRating}`,
        backdropUrl: gs.hiddenGem.backdropUrl || gs.hiddenGem.posterUrl,
      });
    }

    // 6. Overrated Flop
    if (gs.overratedFlop) {
      slides.push({
        id: 'overrated_flop',
        tagline: "The Skeptics' Verdict",
        headline: 'Overrated Flop',
        pill: '📉 Tough Room',
        icon: '📉',
        title: `${gs.overratedFlop.title} (${gs.overratedFlop.year || ''})`,
        sub: 'Letterboxd loved it, our club did not',
        statNum: `${gs.overratedFlop.diff ?? gs.overratedFlop.delta}`,
        statLabel: `Club ${gs.overratedFlop.meanScore} vs Letterboxd ${gs.overratedFlop.letterboxdRating}`,
        backdropUrl: gs.overratedFlop.backdropUrl || gs.overratedFlop.posterUrl,
      });
    }

    // 7. Marathon & Sprint
    if (gs.marathon && gs.sprint) {
      slides.push({
        id: 'runtime_extremes',
        tagline: 'Endurance & Efficiency',
        headline: 'Marathon & Sprint',
        pill: '⏱️ Screen Time',
        icon: '⏱️',
        title: `${gs.marathon.title}`,
        sub: `Longest: ${gs.marathon.runtime} min · Shortest: ${gs.sprint.title} (${gs.sprint.runtime} min)`,
        statNum: `${gs.marathon.runtime}m`,
        statLabel: `Marathon (${(gs.marathon.runtime / 60).toFixed(1)} hrs)`,
        bottomPill: `⚡ Sprint: ${gs.sprint.title} (${gs.sprint.runtime}m)`,
      });
    }

    // 8. Director of the Year
    if (gs.topDirectors && gs.topDirectors.length > 0) {
      const topDir = gs.topDirectors[0];
      slides.push({
        id: 'top_director',
        tagline: 'Master of Cinema',
        headline: 'Director of the Year',
        pill: '🎬 Filmmaker',
        icon: '🎥',
        title: topDir.name,
        sub: `${topDir.count} Screenings in ${data.year}`,
        statNum: String(topDir.avgScore),
        statLabel: `Average Room Score over ${topDir.count} films`,
      });
    }

    // 9. Personal Voter Slide (if user belongs to group)
    if (myVoterProfile) {
      slides.push({
        id: 'my_wrapped',
        tagline: 'Your Cinematic DNA',
        headline: `${myVoterProfile.voter}'s Wrapped`,
        pill: myVoterProfile.archetype || '🎯 The Purist',
        icon: '👤',
        title: myVoterProfile.archetype || 'The Purist',
        sub: myVoterProfile.archetypeDesc || 'Discerning and balanced tastes',
        statNum: String(myVoterProfile.average),
        statLabel: `Your Average Score (${myVoterProfile.count} films)`,
        pills: [
          myVoterProfile.soulmate ? `🤝 Soulmate: ${myVoterProfile.soulmate.voter} (±${myVoterProfile.soulmate.meanDiff})` : null,
          myVoterProfile.rival ? `⚔️ Rival: ${myVoterProfile.rival.voter} (±${myVoterProfile.rival.meanDiff})` : null,
          myVoterProfile.hotTake ? `🌶️ Hot Take: ${myVoterProfile.hotTake.title} (${myVoterProfile.hotTake.myScore ?? myVoterProfile.hotTake.voterScore} vs ${myVoterProfile.hotTake.groupAvg ?? myVoterProfile.hotTake.meanScore})` : null,
        ].filter(Boolean),
      });
    }

    // 10. The Club Assembly (Finale)
    slides.push({
      id: 'finale',
      tagline: "That's a Wrap!",
      headline: `${data.group.name} Crew`,
      pill: '✨ The Cast',
      icon: '🎉',
      title: 'Roll The Credits',
      sub: `${data.voters.length} Cinephiles · Ready for ${Number(data.year) ? Number(data.year) + 1 : 'the Next Chapter'}`,
      statNum: String(data.voters.length),
      statLabel: 'Active Club Voters',
      isFinale: true,
    });

    return slides;
  }, [data, scope, myVoterProfile]);

  // Story Mode: Timer & Auto-advance (6s per slide)
  const DURATION_MS = 6000;
  const INTERVAL_MS = 60;

  useEffect(() => {
    if (mode !== 'story' || isPaused || storySlides.length === 0) return;

    progressTimerRef.current = setInterval(() => {
      setProgress(prev => {
        const next = prev + (INTERVAL_MS / DURATION_MS) * 100;
        if (next >= 100) {
          // Advance to next slide or pause on last
          setCurrentSlideIndex(idx => {
            if (idx < storySlides.length - 1) {
              return idx + 1;
            } else {
              setIsPaused(true);
              return idx;
            }
          });
          return 0;
        }
        return next;
      });
    }, INTERVAL_MS);

    return () => {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    };
  }, [mode, isPaused, storySlides.length, currentSlideIndex]);

  // Story keyboard navigation
  useEffect(() => {
    if (mode !== 'story') return;

    function handleKeyDown(e) {
      if (e.key === 'ArrowRight') {
        goToNextSlide();
      } else if (e.key === 'ArrowLeft') {
        goToPrevSlide();
      } else if (e.key === ' ') {
        e.preventDefault();
        setIsPaused(p => !p);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, currentSlideIndex, storySlides.length]);

  const goToNextSlide = () => {
    if (currentSlideIndex < storySlides.length - 1) {
      setCurrentSlideIndex(i => i + 1);
      setProgress(0);
    }
  };

  const goToPrevSlide = () => {
    if (currentSlideIndex > 0) {
      setCurrentSlideIndex(i => i - 1);
      setProgress(0);
    }
  };

  // Generate shareable markdown/text summary
  const generateTextSummary = () => {
    if (!data) return '';
    const gs = data.groupStats;
    let text = `🎬 **${data.group.name} — ${data.year} Wrapped** 🍿\n\n`;
    text += `📽️ Screenings: ${gs.totalFilms} films (${gs.totalScreenHours} hours)\n`;
    text += `⭐ Group Average Score: ${gs.groupMeanScore}/10\n\n`;
    if (gs.filmOfTheYear) {
      text += `👑 Film of the Year: ${gs.filmOfTheYear.title} (${gs.filmOfTheYear.meanScore}/10)\n`;
    }
    if (gs.civilWar) {
      text += `⚔️ Civil War: ${gs.civilWar.title} (±${gs.civilWar.stdDev})\n`;
    }
    if (gs.hiddenGem) {
      text += `💎 Hidden Gem: ${gs.hiddenGem.title} (+${gs.hiddenGem.diff} vs Letterboxd)\n`;
    }
    if (myVoterProfile) {
      text += `\n👤 My Stats (${myVoterProfile.voter}):\n`;
      text += `  • Archetype: ${myVoterProfile.archetype}\n`;
      text += `  • Personal Average: ${myVoterProfile.average} (${myVoterProfile.count} films)\n`;
      if (myVoterProfile.soulmate) text += `  • Soulmate: ${myVoterProfile.soulmate.voter} (±${myVoterProfile.soulmate.meanDiff})\n`;
      if (myVoterProfile.rival) text += `  • Arch-Rival: ${myVoterProfile.rival.voter} (±${myVoterProfile.rival.meanDiff})\n`;
    }
    text += `\n#MovieNightsWrapped`;
    return text;
  };

  const handleCopySummary = async () => {
    const text = generateTextSummary();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (_) {
      alert('Could not copy to clipboard.');
    }
  };

  return (
    <div className="recap-page">
      {!recap?.enabled && (
        <div style={{
          background: 'rgba(234, 179, 8, 0.12)',
          borderBottom: '1px solid rgba(234, 179, 8, 0.3)',
          color: 'var(--gold)',
          textAlign: 'center',
          padding: '8px 16px',
          fontSize: 12.5,
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        }}>
          <span>🔒</span>
          <span>Admin Preview Mode — Year-End Recap is currently disabled and hidden from navigation for all members.</span>
        </div>
      )}
      {/* TOP TOOLBAR */}
      <div className="recap-toolbar">
        <div className="recap-toolbar-left">
          <div className="recap-brand">
            <span>{recapInfo.icon}</span>
            <span className="recap-brand-gradient">{recapInfo.label}</span>
          </div>
          <div className="recap-club-badge">
            <span>🎬</span>
            <span>{data?.group?.name || activeGroup?.name || 'The Originals'}</span>
          </div>
        </div>

        <div className="recap-toolbar-controls">
          {/* Year Selector */}
          <select
            className="recap-select"
            value={year}
            onChange={e => setYear(e.target.value)}
            title="Select Year"
          >
            {(data?.availableYears || ['2026', 'all']).map(y => (
              <option key={y} value={y}>{y === 'all' ? 'All-Time' : y}</option>
            ))}
          </select>

          {/* Scope Toggle: Movie Nights vs All Rated */}
          <div className="recap-segmented">
            <button
              type="button"
              className={`recap-segment-btn ${scope === 'mn' ? 'active' : ''}`}
              onClick={() => setScope('mn')}
              title="Only films officially screened during Movie Nights"
            >
              🍿 Screenings
            </button>
            <button
              type="button"
              className={`recap-segment-btn ${scope === 'all' ? 'active' : ''}`}
              onClick={() => setScope('all')}
              title="All films rated by club members during this period"
            >
              🌐 All Rated
            </button>
          </div>

          {/* Mode Toggle: Story vs Dossier */}
          <div className="recap-segmented">
            <button
              type="button"
              className={`recap-segment-btn ${mode === 'story' ? 'active' : ''}`}
              onClick={() => setMode('story')}
            >
              📱 Story
            </button>
            <button
              type="button"
              className={`recap-segment-btn ${mode === 'dossier' ? 'active' : ''}`}
              onClick={() => setMode('dossier')}
            >
              📊 Dossier
            </button>
          </div>

          <button
            type="button"
            className="recap-share-btn"
            onClick={() => setShowShareModal(true)}
            title="Share your Recap card"
          >
            <span>✨</span>
            <span>Share</span>
          </button>
        </div>
      </div>

      {/* LOADING STATE */}
      {loading && (
        <div className="recap-loading">
          <div className="recap-spinner">📼</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Rewinding the tape...</div>
          <div style={{ color: 'var(--text3)', fontSize: 13 }}>Calculating consensus, soulmates, and superlatives</div>
        </div>
      )}

      {/* ERROR / DISABLED STATE */}
      {!loading && error && (
        <div className="recap-empty">
          <div style={{ fontSize: 48 }}>🔒</div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>Recap Not Available</div>
          <div style={{ color: 'var(--text2)', maxWidth: 440 }}>{error}</div>
        </div>
      )}

      {/* EMPTY DATA STATE */}
      {!loading && !error && data?.empty && (
        <div className="recap-empty">
          <div style={{ fontSize: 48 }}>🎞️</div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>No Screenings Found</div>
          <div style={{ color: 'var(--text3)' }}>No movie events were recorded for {data.group.name} in {year}.</div>
        </div>
      )}

      {/* ================= STORY MODE ================= */}
      {!loading && !error && !data?.empty && mode === 'story' && storySlides.length > 0 && (
        <div className="recap-story-wrap">
          <div className="recap-story-stage">
            {/* Story Progress Bars */}
            <div className="recap-story-bars">
              {storySlides.map((_, idx) => (
                <div key={idx} className="recap-story-bar">
                  <div
                    className="recap-story-fill"
                    style={{
                      width: idx < currentSlideIndex
                        ? '100%'
                        : idx === currentSlideIndex
                          ? `${progress}%`
                          : '0%',
                    }}
                  />
                </div>
              ))}
            </div>

            {/* Story Header */}
            <div className="recap-story-header">
              <span className="recap-story-pill">
                {storySlides[currentSlideIndex].pill}
              </span>
              <div className="recap-story-actions">
                <button
                  type="button"
                  className="recap-story-icon-btn"
                  onClick={() => setIsPaused(p => !p)}
                  title={isPaused ? 'Resume auto-play' : 'Pause'}
                >
                  {isPaused ? '▶' : '⏸'}
                </button>
              </div>
            </div>

            {/* Tap Zones for Next / Prev */}
            <div className="recap-tap-zone recap-tap-left" onClick={goToPrevSlide} />
            <div className="recap-tap-zone recap-tap-right" onClick={goToNextSlide} />

            {/* Current Slide Render */}
            {(() => {
              const slide = storySlides[currentSlideIndex];
              return (
                <div key={slide.id} className="recap-slide">
                  {slide.backdropUrl && (
                    <div
                      className="recap-slide-backdrop"
                      style={{ backgroundImage: `url(${slide.backdropUrl})` }}
                    />
                  )}

                  <div className="recap-slide-top">
                    <div className="recap-slide-tagline">{slide.tagline}</div>
                    <h2 className="recap-slide-headline">{slide.headline}</h2>
                  </div>

                  <div className="recap-slide-center">
                    <div className="recap-slide-card">
                      <div className="recap-slide-big-icon">{slide.icon}</div>
                      <div className="recap-slide-title">{slide.title}</div>
                      <div className="recap-slide-sub">{slide.sub}</div>

                      {slide.statNum && (
                        <div className="recap-slide-stat-num">{slide.statNum}</div>
                      )}
                      {slide.statLabel && (
                        <div className="recap-slide-stat-label">{slide.statLabel}</div>
                      )}

                      {slide.pills && slide.pills.length > 0 && (
                        <div className="recap-slide-pills">
                          {slide.pills.map((p, i) => (
                            <span key={i} className="recap-pill-item">{p}</span>
                          ))}
                        </div>
                      )}

                      {slide.bottomPill && (
                        <div style={{ marginTop: 14 }}>
                          <span className="recap-pill-item" style={{ background: 'rgba(255, 255, 255, 0.1)', color: '#fff' }}>
                            {slide.bottomPill}
                          </span>
                        </div>
                      )}

                      {slide.isFinale && (
                        <div style={{ marginTop: 20 }}>
                          <button
                            type="button"
                            className="recap-share-btn"
                            onClick={() => setShowShareModal(true)}
                          >
                            <span>✨</span>
                            <span>Share Your Wrapped</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 11 }}>
                    Tap left/right to navigate · Space to pause
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Slide Navigation Indicator & Controls */}
          <div className="recap-story-controls">
            <button
              type="button"
              className="recap-btn-subtle"
              onClick={goToPrevSlide}
              disabled={currentSlideIndex === 0}
            >
              ← Previous
            </button>
            <span className="recap-nav-indicator">
              {currentSlideIndex + 1} / {storySlides.length}
            </span>
            <button
              type="button"
              className="recap-btn-subtle"
              onClick={goToNextSlide}
              disabled={currentSlideIndex === storySlides.length - 1}
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {/* ================= DOSSIER MODE ================= */}
      {!loading && !error && !data?.empty && mode === 'dossier' && (
        <div className="recap-dossier-wrap">
          {/* Hero Banner */}
          <div className="recap-hero">
            <div className="recap-hero-left">
              <h1>{data.group.name} · {data.year === 'all' ? 'All-Time' : data.year}</h1>
              <p className="recap-hero-desc">
                Annual cinematic retrospective covering {data.groupStats.totalFilms} films, {data.groupStats.totalScreenHours} hours of screenings, and {data.voters.length} club voters.
              </p>
            </div>
            <div className="recap-hero-actions">
              <button
                type="button"
                className="recap-share-btn"
                onClick={() => setShowShareModal(true)}
              >
                <span>✨</span>
                <span>Share Card</span>
              </button>
            </div>
          </div>

          {/* Big 4 Metrics Grid */}
          <div className="recap-metrics-grid">
            <div className="recap-metric-card">
              <div className="recap-metric-title">🍿 Screenings</div>
              <div className="recap-metric-value">{data.groupStats.totalFilms}</div>
              <div className="recap-metric-sub">{scope === 'mn' ? 'Movie Nights Screened' : 'Total Rated Films'}</div>
            </div>
            <div className="recap-metric-card">
              <div className="recap-metric-title">⏱️ Hours Watched</div>
              <div className="recap-metric-value">{data.groupStats.totalScreenHours}</div>
              <div className="recap-metric-sub">Total Runtime in Screenings</div>
            </div>
            <div className="recap-metric-card">
              <div className="recap-metric-title">⭐ Room Average</div>
              <div className="recap-metric-value">{data.groupStats.groupMeanScore}</div>
              <div className="recap-metric-sub">Mean Score Across All Voters</div>
            </div>
            <div className="recap-metric-card">
              <div className="recap-metric-title">👑 Film of Year</div>
              <div className="recap-metric-value" style={{ fontSize: 20, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {data.groupStats.filmOfTheYear?.title || 'None'}
              </div>
              <div className="recap-metric-sub">Avg {data.groupStats.filmOfTheYear?.meanScore || '0'}/10</div>
            </div>
          </div>

          {/* Superlatives Section */}
          <div className="recap-section">
            <div className="recap-section-head">
              <div className="recap-section-title">
                <span>🏆</span>
                <span>Group Superlatives</span>
              </div>
              <div className="recap-section-subtitle">Highlights & Key Milestones</div>
            </div>

            <div className="recap-superlatives-grid">
              {/* Film of the Year */}
              {data.groupStats.filmOfTheYear && (
                <div className="recap-super-card">
                  <div className="recap-super-tag gold">👑 Film of the Year</div>
                  <div className="recap-super-title">{data.groupStats.filmOfTheYear.title} ({data.groupStats.filmOfTheYear.year || ''})</div>
                  <div className="recap-super-meta">Dir. {data.groupStats.filmOfTheYear.director || 'Unknown'}</div>
                  <div className="recap-super-stat-row">
                    <span style={{ color: 'var(--text3)' }}>Consensus Average</span>
                    <strong style={{ color: 'var(--gold)' }}>{data.groupStats.filmOfTheYear.meanScore} / 10</strong>
                  </div>
                </div>
              )}

              {/* Civil War */}
              {data.groupStats.civilWar && (
                <div className="recap-super-card">
                  <div className="recap-super-tag red">⚔️ Civil War (Most Divisive)</div>
                  <div className="recap-super-title">{data.groupStats.civilWar.title}</div>
                  <div className="recap-super-meta">
                    ±{data.groupStats.civilWar.stdDev} StdDev · {data.groupStats.civilWar.divergence ? `${data.groupStats.civilWar.divergence.highVoter} (${data.groupStats.civilWar.divergence.highScore}) vs ${data.groupStats.civilWar.divergence.lowVoter} (${data.groupStats.civilWar.divergence.lowScore})` : "Room polarization"}
                  </div>
                  <div className="recap-super-stat-row">
                    <span style={{ color: 'var(--text3)' }}>Room Polarization</span>
                    <strong style={{ color: '#f85149' }}>High Divergence</strong>
                  </div>
                </div>
              )}

              {/* Unanimous Peace */}
              {data.groupStats.unanimousPeace && (
                <div className="recap-super-card">
                  <div className="recap-super-tag green">🕊️ Unanimous Peace (Consensus)</div>
                  <div className="recap-super-title">{data.groupStats.unanimousPeace.title}</div>
                  <div className="recap-super-meta">Standard Deviation ±{data.groupStats.unanimousPeace.stdDev}</div>
                  <div className="recap-super-stat-row">
                    <span style={{ color: 'var(--text3)' }}>Group Average</span>
                    <strong style={{ color: '#3fb950' }}>{data.groupStats.unanimousPeace.meanScore} / 10</strong>
                  </div>
                </div>
              )}

              {/* Hidden Gem */}
              {data.groupStats.hiddenGem && (
                <div className="recap-super-card">
                  <div className="recap-super-tag blue">💎 Hidden Gem vs Letterboxd</div>
                  <div className="recap-super-title">{data.groupStats.hiddenGem.title}</div>
                  <div className="recap-super-meta">Club: {data.groupStats.hiddenGem.meanScore} · Letterboxd: {data.groupStats.hiddenGem.letterboxdRating}</div>
                  <div className="recap-super-stat-row">
                    <span style={{ color: 'var(--text3)' }}>Difference</span>
                    <strong style={{ color: '#58a6ff' }}>+{data.groupStats.hiddenGem.diff ?? data.groupStats.hiddenGem.delta}</strong>
                  </div>
                </div>
              )}

              {/* Overrated Flop */}
              {data.groupStats.overratedFlop && (
                <div className="recap-super-card">
                  <div className="recap-super-tag purple">📉 Overrated on Letterboxd</div>
                  <div className="recap-super-title">{data.groupStats.overratedFlop.title}</div>
                  <div className="recap-super-meta">Club: {data.groupStats.overratedFlop.meanScore} · Letterboxd: {data.groupStats.overratedFlop.letterboxdRating}</div>
                  <div className="recap-super-stat-row">
                    <span style={{ color: 'var(--text3)' }}>Difference</span>
                    <strong style={{ color: '#bc8cff' }}>{data.groupStats.overratedFlop.diff ?? data.groupStats.overratedFlop.delta}</strong>
                  </div>
                </div>
              )}

              {/* Top Directors List */}
              {data.groupStats.topDirectors && data.groupStats.topDirectors.length > 0 && (
                <div className="recap-super-card">
                  <div className="recap-super-tag blue">🎬 Top Directors</div>
                  <div className="recap-directors-list">
                    {data.groupStats.topDirectors.map((d, i) => (
                      <div key={d.name} className="recap-director-row">
                        <span>{i + 1}. {d.name} ({d.count} films)</span>
                        <strong>{d.avgScore}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Club Voters Dossier */}
          <div className="recap-section">
            <div className="recap-section-head">
              <div className="recap-section-title">
                <span>👥</span>
                <span>Voter Dossiers</span>
              </div>
              <div className="recap-section-subtitle">Archetypes, Hot Takes & Pairwise Soulmates</div>
            </div>

            <div className="recap-voters-grid">
              {data.voters.map(v => {
                const isMe = v.voter === voter;
                return (
                  <div key={v.voter} className={`recap-voter-card ${isMe ? 'is-me' : ''}`}>
                    <div className="recap-voter-header">
                      <div className="recap-voter-id-group">
                        <UserAvatar name={v.voter} avatarUrl={v.avatarUrl} size={38} />
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span className="recap-voter-name">{v.voter}</span>
                            {isMe && <span className="recap-me-pill">You</span>}
                          </div>
                        </div>
                      </div>
                      <span className="recap-voter-archetype-badge">
                        {v.archetype || '🎯 The Purist'}
                      </span>
                    </div>

                    <div className="recap-voter-archetype-desc">
                      {v.archetypeDesc || 'Balanced tastes across all film genres'}
                    </div>

                    <div className="recap-voter-stats-table">
                      <div className="recap-voter-stat-line">
                        <span className="recap-voter-stat-muted">Films Rated ({data.year})</span>
                        <span className="recap-voter-stat-val">{v.count}</span>
                      </div>
                      <div className="recap-voter-stat-line">
                        <span className="recap-voter-stat-muted">Average Score</span>
                        <span className="recap-voter-stat-val">{v.average}</span>
                      </div>
                      <div className="recap-voter-stat-line">
                        <span className="recap-voter-stat-muted">🤝 Soulmate</span>
                        <span className="recap-voter-stat-val">
                          {v.soulmate ? `${v.soulmate.voter} (±${v.soulmate.meanDiff})` : '—'}
                        </span>
                      </div>
                      <div className="recap-voter-stat-line">
                        <span className="recap-voter-stat-muted">⚔️ Arch-Rival</span>
                        <span className="recap-voter-stat-val">
                          {v.rival ? `${v.rival.voter} (±${v.rival.meanDiff})` : '—'}
                        </span>
                      </div>
                      {v.hotTake && (
                        <div className="recap-voter-stat-line">
                          <span className="recap-voter-stat-muted">🌶️ Hot Take</span>
                          <span className="recap-voter-stat-val" style={{ fontSize: 12, color: 'var(--gold)' }}>
                            {v.hotTake.title} ({v.hotTake.myScore ?? v.hotTake.voterScore} vs {v.hotTake.groupAvg ?? v.hotTake.meanScore})
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* SHARE MODAL */}
      {showShareModal && (
        <div className="recap-modal-backdrop" onClick={() => setShowShareModal(false)}>
          <div className="recap-modal-card" onClick={e => e.stopPropagation()}>
            <div className="recap-modal-header">
              <h3 className="recap-modal-title">✨ Share Your Wrapped</h3>
              <button
                type="button"
                className="recap-btn-subtle"
                onClick={() => setShowShareModal(false)}
              >
                ✕
              </button>
            </div>

            <div className="recap-share-preview-card">
              <div className="recap-share-meta-row">
                <span style={{ fontWeight: 800, fontSize: 16 }}>🎬 {data?.group?.name}</span>
                <span style={{ fontSize: 13, color: 'var(--gold)', fontWeight: 700 }}>{data?.year} WRAPPED</span>
              </div>

              <div>
                <div style={{ fontSize: 12, color: 'var(--text3)', textTransform: 'uppercase' }}>Screenings & Consensus</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', marginTop: 2 }}>
                  {data?.groupStats?.totalFilms} Films · Room Avg {data?.groupStats?.groupMeanScore}
                </div>
              </div>

              {data?.groupStats?.filmOfTheYear && (
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase' }}>Film of the Year</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>
                    👑 {data.groupStats.filmOfTheYear.title} ({data.groupStats.filmOfTheYear.meanScore}/10)
                  </div>
                </div>
              )}

              {myVoterProfile && (
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 10 }}>
                  <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase' }}>My Archetype ({myVoterProfile.voter})</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#bc8cff' }}>
                    {myVoterProfile.archetype} (Avg {myVoterProfile.average})
                  </div>
                  {myVoterProfile.soulmate && (
                    <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>
                      🤝 Soulmate: {myVoterProfile.soulmate.voter} (±{myVoterProfile.soulmate.meanDiff})
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="recap-share-actions">
              <button
                type="button"
                className="recap-share-btn"
                onClick={handleCopySummary}
              >
                <span>{copied ? '✅' : '📋'}</span>
                <span>{copied ? 'Copied to Clipboard!' : 'Copy Text Summary'}</span>
              </button>
              <button
                type="button"
                className="recap-btn-subtle"
                onClick={() => setShowShareModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
