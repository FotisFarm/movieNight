import { NavLink } from 'react-router-dom';
import './Header.css';

export default function Header({ voter, onLogout }) {
  return (
    <header className="header">
      <div className="header-inner">
        <div className="logo">🎬 <span>Movie Night</span></div>
        <nav className="nav">
          <NavLink to="/films"    className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Films</NavLink>
          <NavLink to="/rankings" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Rankings</NavLink>
          <NavLink to="/watchlist"       className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Watchlist</NavLink>
          <NavLink to="/recommendations" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Picks</NavLink>
          <NavLink to="/controversy"     className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Controversy</NavLink>
          <NavLink to="/stats"           className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Stats</NavLink>
          <NavLink to="/compare"         className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Compare</NavLink>
        </nav>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto', flexShrink: 0 }}>
          {voter && <span style={{ fontSize: 12, color: 'var(--text2)', fontWeight: 600 }}>{voter}</span>}
          {onLogout && <button className="btn btn-ghost btn-sm" onClick={onLogout}>Sign out</button>}
        </div>
      </div>
    </header>
  );
}
