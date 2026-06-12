import { NavLink } from 'react-router-dom';
import './Header.css';

export default function Header() {
  return (
    <header className="header">
      <div className="header-inner">
        <div className="logo">🎬 <span>Movie Night</span></div>
        <nav className="nav">
          <NavLink to="/films"    className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Films</NavLink>
          <NavLink to="/rankings" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Rankings</NavLink>
          <NavLink to="/watchlist"className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Watchlist</NavLink>
        </nav>
      </div>
    </header>
  );
}
