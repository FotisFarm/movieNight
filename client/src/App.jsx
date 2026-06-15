import { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Header from './components/Header';
import Films from './pages/Films';
import Rankings from './pages/Rankings';
import Watchlist from './pages/Watchlist';
import Recommendations from './pages/Recommendations';
import Login from './pages/Login';
import { api } from './api';

export default function App() {
  const [authed, setAuthed] = useState(null); // null = checking

  useEffect(() => {
    api.me().then(d => setAuthed(!!d.user)).catch(() => setAuthed(false));
  }, []);

  if (authed === null) return null; // brief flash while checking session
  if (!authed) return <Login onLogin={() => setAuthed(true)} />;

  return (
    <div className="app">
      <Header onLogout={() => { api.logout(); setAuthed(false); }} />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Navigate to="/films" replace />} />
          <Route path="/films" element={<Films />} />
          <Route path="/rankings" element={<Rankings />} />
          <Route path="/watchlist" element={<Watchlist />} />
          <Route path="/recommendations" element={<Recommendations />} />
        </Routes>
      </main>
    </div>
  );
}
