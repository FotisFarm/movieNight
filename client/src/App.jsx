import { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Header from './components/Header';
import Films from './pages/Films';
import Rankings from './pages/Rankings';
import Watchlist from './pages/Watchlist';
import Recommendations from './pages/Recommendations';
import Controversy from './pages/Controversy';
import Stats from './pages/Stats';
import Login from './pages/Login';
import { api } from './api';

export default function App() {
  const [voter, setVoter] = useState(null); // null = checking, '' = not logged in

  useEffect(() => {
    api.me().then(d => setVoter(d.voter || '')).catch(() => setVoter(''));
  }, []);

  if (voter === null) return null;
  if (!voter) return <Login onLogin={v => setVoter(v)} />;

  return (
    <div className="app">
      <Header voter={voter} onLogout={() => { api.logout(); setVoter(''); }} />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Navigate to="/films" replace />} />
          <Route path="/films" element={<Films />} />
          <Route path="/rankings" element={<Rankings />} />
          <Route path="/watchlist" element={<Watchlist voter={voter} />} />
          <Route path="/recommendations" element={<Recommendations />} />
          <Route path="/controversy" element={<Controversy />} />
          <Route path="/stats" element={<Stats />} />
        </Routes>
      </main>
    </div>
  );
}
