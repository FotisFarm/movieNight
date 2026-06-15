import { NavLink } from 'react-router-dom';
import './Header.css';

export default function Header({ onLogout }) {
  return (
    <header className="header">
      <div className="header-inner">
        <div className="logo">🎬 <span>Movie Night</span></div>
        <nav className="nav">
          <NavLink to="/films"    className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Films</NavLink>
          <NavLink to="/rankings" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Rankings</NavLink>
          <NavLink to="/watchlist"       className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Watchlist</NavLink>
          <NavLink to="/recommendations" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Picks</NavLink>
        </nav>
        {onLogout && <button className="btn btn-ghost btn-sm" onClick={onLogout} style={{ marginLeft: 8 }}>Sign out</button>}
      </div>
    </header>
  );
}
