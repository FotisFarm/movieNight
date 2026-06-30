import { useState, useRef, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { useTheme } from '../ThemeContext';
import './Header.css';

const THEMES = [
  { id: 'current',        label: 'Current'                  },
  { id: 'matrix',         label: 'The Matrix'               },
  { id: 'vertigo',        label: 'Vertigo'                  },
  { id: 'clockwork',      label: 'A Clockwork Orange'       },
  { id: 'taxi-driver',    label: 'Taxi Driver'              },
  { id: 'blade-runner',   label: 'Blade Runner'             },
  { id: 'amelie',         label: 'Amélie'                   },
  { id: 'godfather',      label: 'The Godfather'            },
  { id: 'grand-budapest', label: 'The Grand Budapest Hotel' },
];

function navClass({ isActive }) {
  return isActive ? 'nav-link active' : 'nav-link';
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

  const activeLabel = THEMES.find(t => t.id === theme)?.label ?? 'Theme';

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
