import { useState, useRef, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
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

// HAL 9000's eye — the entry point to the chatbot.
function HalLink() {
  return (
    <NavLink
      to="/chat"
      className={({ isActive }) => `hal-link${isActive ? ' active' : ''}`}
      title="Ask HAL"
      aria-label="Ask HAL"
    >
      <svg className="hal-eye" viewBox="0 0 40 40" width="26" height="26" aria-hidden="true">
        <defs>
          <radialGradient id="halLens" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fff3c0" />
            <stop offset="22%" stopColor="#ff5a3c" />
            <stop offset="60%" stopColor="#c01818" />
            <stop offset="100%" stopColor="#3a0505" />
          </radialGradient>
        </defs>
        <circle cx="20" cy="20" r="19" fill="#0c0c0e" stroke="#2a2b33" />
        <circle cx="20" cy="20" r="11" fill="url(#halLens)" />
        <circle cx="16.5" cy="16.5" r="2.3" fill="#fff" opacity="0.85" />
      </svg>
    </NavLink>
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
      >
        <span>{activeLabel}</span>
        <span className="theme-drop-caret">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="theme-drop-menu">
          {THEMES.map(t => (
            <button
              key={t.id}
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
  return (
    <>
      <header className="header">
        <div className="header-inner">
          <div className="logo">
            <span className="logo-icon">🎬</span>
            <span className="logo-text">Movie Night</span>
          </div>
          <nav className="nav">
            <NavLink to="/films"           className={navClass}>Films</NavLink>
            <NavLink to="/rankings"        className={navClass}>Rankings</NavLink>
            <NavLink to="/watchlist"       className={navClass}>Watchlist</NavLink>
            <NavLink to="/recommendations" className={navClass}>Picks</NavLink>
            <NavLink to="/controversy"     className={navClass}>Controversy</NavLink>
            <NavLink to="/stats"           className={navClass}>Stats</NavLink>
            <NavLink to="/compare"         className={navClass}>Compare</NavLink>
          </nav>
          <div className="header-right">
            <HalLink />
            <ThemeDropdown />
            <span className="header-voter header-voter-desktop">{voter}</span>
            {onLogout && (
              <button className="btn btn-ghost btn-sm header-logout-desktop" onClick={onLogout}>
                Sign out
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="mobile-footer">
        <div className="logo">
          <span className="logo-icon">🎬</span>
          <span className="logo-text">Movie Night</span>
        </div>
        <HalLink />
        <ThemeDropdown up={true} />
        <div className="mobile-footer-right">
          {voter && <span className="header-voter">{voter}</span>}
          {onLogout && (
            <button className="btn btn-ghost btn-sm" onClick={onLogout}>Sign out</button>
          )}
        </div>
      </div>
    </>
  );
}
