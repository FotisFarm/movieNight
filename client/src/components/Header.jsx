import { useState, useRef, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useTheme } from '../ThemeContext';
import './Header.css';

const THEMES = [
  { id: 'original',       label: 'Original'                 },
  { id: 'matrix',         label: 'The Matrix'               },
  { id: 'vertigo',        label: 'Vertigo'                  },
  { id: 'clockwork',      label: 'A Clockwork Orange'       },
  { id: 'taxi-driver',    label: 'Taxi Driver'              },
  { id: 'blade-runner',   label: 'Blade Runner'             },
  { id: 'amelie',         label: 'Amélie'                   },
  { id: 'godfather',      label: 'The Godfather'            },
  { id: 'grand-budapest', label: 'The Grand Budapest Hotel' },
  { id: 'itmfl',          label: 'In the Mood for Love'     },
];

function navClass({ isActive }) {
  return isActive ? 'nav-link active' : 'nav-link';
}

function IconFilms() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
      <line x1="7" y1="2" x2="7" y2="22" />
      <line x1="17" y1="2" x2="17" y2="22" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <line x1="2" y1="7" x2="7" y2="7" />
      <line x1="2" y1="17" x2="7" y2="17" />
      <line x1="17" y1="17" x2="22" y2="17" />
      <line x1="17" y1="7" x2="22" y2="7" />
    </svg>
  );
}

function IconWatchlist() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function IconRankings() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.45 1-1 1H8v4h8v-4h-1c-.55 0-1-.45-1-1v-2.34" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2z" />
    </svg>
  );
}

function IconStats() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}

function IconMore() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="19" cy="12" r="1.5" />
      <circle cx="5" cy="12" r="1.5" />
    </svg>
  );
}

function ThemeDropdown({ up = false }) {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onDown(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const activeLabel = THEMES.find(t => t.id === theme)?.label ?? 'Original';

  return (
    <div className={`theme-dropdown${up ? ' theme-dropdown-up' : ''}`} ref={ref}>
      <button
        className="theme-drop-btn"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        type="button"
      >
        <span>{activeLabel}</span>
        <span className="theme-drop-caret">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="theme-drop-menu">
          {THEMES.map(t => (
            <button
              key={t.id}
              type="button"
              className={`theme-drop-item${theme === t.id ? ' active' : ''}`}
              onClick={() => { setTheme(t.id); setOpen(false); }}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Header({ voter, onLogout }) {
  const { theme, setTheme } = useTheme();
  const location = useLocation();
  const pathname = location.pathname;

  const [rankingsOpen, setRankingsOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const rankingsRef = useRef(null);
  const statsRef = useRef(null);

  // Debounce timers for smooth hover transitions between trigger and menu
  const rankingsTimerRef = useRef(null);
  const statsTimerRef = useRef(null);

  const handleRankingsEnter = () => {
    if (rankingsTimerRef.current) clearTimeout(rankingsTimerRef.current);
    setRankingsOpen(true);
  };

  const handleRankingsLeave = () => {
    rankingsTimerRef.current = setTimeout(() => {
      setRankingsOpen(false);
    }, 180);
  };

  const handleStatsEnter = () => {
    if (statsTimerRef.current) clearTimeout(statsTimerRef.current);
    setStatsOpen(true);
  };

  const handleStatsLeave = () => {
    statsTimerRef.current = setTimeout(() => {
      setStatsOpen(false);
    }, 180);
  };

  useEffect(() => {
    return () => {
      if (rankingsTimerRef.current) clearTimeout(rankingsTimerRef.current);
      if (statsTimerRef.current) clearTimeout(statsTimerRef.current);
    };
  }, []);

  // Active hub detection
  const isRankingsHubActive = (
    pathname.startsWith('/rankings') ||
    pathname.startsWith('/recommendations') ||
    pathname.startsWith('/controversy')
  );

  const isStatsHubActive = (
    pathname.startsWith('/stats') ||
    pathname.startsWith('/compare')
  );

  const isMoreHubActive = (
    pathname.startsWith('/lists') ||
    pathname.startsWith('/recommendations') ||
    pathname.startsWith('/controversy') ||
    pathname.startsWith('/compare')
  );

  // Close menus on route change
  useEffect(() => {
    setRankingsOpen(false);
    setStatsOpen(false);
    setMoreOpen(false);
  }, [pathname]);

  // Click outside to close desktop dropdowns
  useEffect(() => {
    function handleOutside(e) {
      if (rankingsRef.current && !rankingsRef.current.contains(e.target)) {
        setRankingsOpen(false);
      }
      if (statsRef.current && !statsRef.current.contains(e.target)) {
        setStatsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  // Escape key closes menus
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        setRankingsOpen(false);
        setStatsOpen(false);
        setMoreOpen(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Lock body scroll when mobile More sheet is open
  useEffect(() => {
    if (moreOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [moreOpen]);

  return (
    <>
      <header className="header">
        <div className="header-inner">
          <NavLink to="/films" className="logo">
            <span className="logo-icon">🎬</span>
            <span className="logo-text">Movie Night</span>
          </NavLink>

          {/* Desktop Navigation Hubs (hidden on mobile <= 640px) */}
          <nav className="nav desktop-nav" aria-label="Main Navigation">
            <NavLink to="/films" className={navClass}>
              Films
            </NavLink>

            <NavLink to="/watchlist" className={navClass}>
              Watchlist
            </NavLink>

            {/* Rankings Hub Dropdown */}
            <div
              className={`nav-dropdown ${rankingsOpen ? 'open' : ''}`}
              ref={rankingsRef}
              onMouseEnter={handleRankingsEnter}
              onMouseLeave={handleRankingsLeave}
            >
              <button
                type="button"
                className={`nav-link nav-dropdown-trigger ${isRankingsHubActive ? 'active' : ''}`}
                onClick={() => setRankingsOpen(o => !o)}
                aria-expanded={rankingsOpen}
                aria-haspopup="true"
              >
                <span>Rankings</span>
                <span className="nav-caret">{rankingsOpen ? '▴' : '▾'}</span>
              </button>

              {rankingsOpen && (
                <div
                  className="nav-dropdown-menu"
                  onMouseEnter={handleRankingsEnter}
                  onMouseLeave={handleRankingsLeave}
                >
                  <NavLink
                    to="/rankings"
                    end
                    className={({ isActive }) => isActive ? 'nav-dropdown-item active' : 'nav-dropdown-item'}
                    onClick={() => setRankingsOpen(false)}
                  >
                    <span className="nav-item-icon">🏆</span>
                    <div className="nav-item-text">
                      <span className="nav-item-title">Leaderboards</span>
                      <span className="nav-item-desc">Top 10, Directors & Decades</span>
                    </div>
                  </NavLink>
                  <NavLink
                    to="/recommendations"
                    className={({ isActive }) => isActive ? 'nav-dropdown-item active' : 'nav-dropdown-item'}
                    onClick={() => setRankingsOpen(false)}
                  >
                    <span className="nav-item-icon">🎯</span>
                    <div className="nav-item-text">
                      <span className="nav-item-title">Picks</span>
                      <span className="nav-item-desc">Bayesian Recommendations</span>
                    </div>
                  </NavLink>
                  <NavLink
                    to="/controversy"
                    className={({ isActive }) => isActive ? 'nav-dropdown-item active' : 'nav-dropdown-item'}
                    onClick={() => setRankingsOpen(false)}
                  >
                    <span className="nav-item-icon">⚡</span>
                    <div className="nav-item-text">
                      <span className="nav-item-title">Controversy</span>
                      <span className="nav-item-desc">Polarization & Divergence</span>
                    </div>
                  </NavLink>
                </div>
              )}
            </div>

            <NavLink to="/lists" className={navClass}>
              Lists
            </NavLink>

            {/* Stats Hub Dropdown */}
            <div
              className={`nav-dropdown ${statsOpen ? 'open' : ''}`}
              ref={statsRef}
              onMouseEnter={handleStatsEnter}
              onMouseLeave={handleStatsLeave}
            >
              <button
                type="button"
                className={`nav-link nav-dropdown-trigger ${isStatsHubActive ? 'active' : ''}`}
                onClick={() => setStatsOpen(o => !o)}
                aria-expanded={statsOpen}
                aria-haspopup="true"
              >
                <span>Stats</span>
                <span className="nav-caret">{statsOpen ? '▴' : '▾'}</span>
              </button>

              {statsOpen && (
                <div
                  className="nav-dropdown-menu"
                  onMouseEnter={handleStatsEnter}
                  onMouseLeave={handleStatsLeave}
                >
                  <NavLink
                    to="/stats"
                    end
                    className={({ isActive }) => isActive ? 'nav-dropdown-item active' : 'nav-dropdown-item'}
                    onClick={() => setStatsOpen(false)}
                  >
                    <span className="nav-item-icon">📊</span>
                    <div className="nav-item-text">
                      <span className="nav-item-title">Voter Analytics</span>
                      <span className="nav-item-desc">Scores, Biases & Top 10s</span>
                    </div>
                  </NavLink>
                  <NavLink
                    to="/compare"
                    className={({ isActive }) => isActive ? 'nav-dropdown-item active' : 'nav-dropdown-item'}
                    onClick={() => setStatsOpen(false)}
                  >
                    <span className="nav-item-icon">⚖️</span>
                    <div className="nav-item-text">
                      <span className="nav-item-title">Head-to-Head</span>
                      <span className="nav-item-desc">Film & Voter Matchups</span>
                    </div>
                  </NavLink>
                </div>
              )}
            </div>
          </nav>

          <div className="header-right">
            <ThemeDropdown />
            {voter && <span className="header-voter header-voter-desktop">{voter}</span>}
            {onLogout && (
              <button
                type="button"
                className="btn btn-ghost btn-sm header-logout-desktop"
                onClick={onLogout}
              >
                Sign out
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Mobile 5-Tab Bottom Navigation Bar (visible only <= 640px) */}
      <nav className="mobile-bottom-bar" aria-label="Mobile Bottom Navigation">
        <NavLink
          to="/films"
          className={({ isActive }) => isActive ? 'mobile-tab active' : 'mobile-tab'}
        >
          <IconFilms />
          <span className="mobile-tab-label">Films</span>
        </NavLink>

        <NavLink
          to="/watchlist"
          className={({ isActive }) => isActive ? 'mobile-tab active' : 'mobile-tab'}
        >
          <IconWatchlist />
          <span className="mobile-tab-label">Watchlist</span>
        </NavLink>

        <NavLink
          to="/rankings"
          className={({ isActive }) => (isActive || (isRankingsHubActive && !isMoreHubActive)) ? 'mobile-tab active' : 'mobile-tab'}
        >
          <IconRankings />
          <span className="mobile-tab-label">Rankings</span>
        </NavLink>

        <NavLink
          to="/stats"
          className={({ isActive }) => (isActive || (isStatsHubActive && pathname !== '/compare')) ? 'mobile-tab active' : 'mobile-tab'}
        >
          <IconStats />
          <span className="mobile-tab-label">Stats</span>
        </NavLink>

        <button
          type="button"
          className={`mobile-tab mobile-tab-more ${isMoreHubActive ? 'active' : ''}`}
          onClick={() => setMoreOpen(true)}
          aria-label="More navigation options"
          aria-expanded={moreOpen}
        >
          <div className="mobile-tab-icon-wrap">
            <IconMore />
            {isMoreHubActive && <span className="mobile-more-badge-dot" />}
          </div>
          <span className="mobile-tab-label">More</span>
        </button>
      </nav>

      {/* Mobile "More" Bottom Sheet Drawer */}
      {moreOpen && (
        <div className="more-drawer-overlay" onClick={() => setMoreOpen(false)}>
          <div className="more-drawer-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="more-drawer-handle" />
            <div className="more-drawer-header">
              <div className="more-drawer-title-row">
                <span className="more-drawer-logo">🎬</span>
                <span className="more-drawer-title">More Navigation</span>
              </div>
              <button
                type="button"
                className="more-drawer-close"
                onClick={() => setMoreOpen(false)}
                aria-label="Close menu"
              >
                ✕
              </button>
            </div>

            <div className="more-drawer-body">
              <div className="more-nav-grid">
                <NavLink
                  to="/lists"
                  className={({ isActive }) => isActive ? 'more-nav-card active' : 'more-nav-card'}
                  onClick={() => setMoreOpen(false)}
                >
                  <div className="more-card-icon">📑</div>
                  <div className="more-card-content">
                    <div className="more-card-title">Lists</div>
                    <div className="more-card-desc">Custom curated collections</div>
                  </div>
                </NavLink>

                <NavLink
                  to="/recommendations"
                  className={({ isActive }) => isActive ? 'more-nav-card active' : 'more-nav-card'}
                  onClick={() => setMoreOpen(false)}
                >
                  <div className="more-card-icon">🎯</div>
                  <div className="more-card-content">
                    <div className="more-card-title">Picks</div>
                    <div className="more-card-desc">Bayesian predictive engine</div>
                  </div>
                </NavLink>

                <NavLink
                  to="/controversy"
                  className={({ isActive }) => isActive ? 'more-nav-card active' : 'more-nav-card'}
                  onClick={() => setMoreOpen(false)}
                >
                  <div className="more-card-icon">⚡</div>
                  <div className="more-card-content">
                    <div className="more-card-title">Controversy</div>
                    <div className="more-card-desc">Polarizing group films</div>
                  </div>
                </NavLink>

                <NavLink
                  to="/compare"
                  className={({ isActive }) => isActive ? 'more-nav-card active' : 'more-nav-card'}
                  onClick={() => setMoreOpen(false)}
                >
                  <div className="more-card-icon">⚖️</div>
                  <div className="more-card-content">
                    <div className="more-card-title">Compare</div>
                    <div className="more-card-desc">Head-to-head match-ups</div>
                  </div>
                </NavLink>
              </div>

              <div className="more-drawer-divider" />

              <div className="more-drawer-section">
                <div className="more-section-label">Theme Palette</div>
                <div className="more-themes-grid">
                  {THEMES.map(t => (
                    <button
                      key={t.id}
                      type="button"
                      className={`more-theme-chip ${theme === t.id ? 'active' : ''}`}
                      onClick={() => setTheme(t.id)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {voter && (
                <>
                  <div className="more-drawer-divider" />
                  <div className="more-account-row">
                    <div className="more-account-info">
                      <span className="more-account-label">Signed in as</span>
                      <span className="more-account-name">{voter}</span>
                    </div>
                    {onLogout && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm more-signout-btn"
                        onClick={() => {
                          setMoreOpen(false);
                          onLogout();
                        }}
                      >
                        Sign out
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
