import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Header from './components/Header';
import Films from './pages/Films';
import Rankings from './pages/Rankings';
import Watchlist from './pages/Watchlist';
import Recommendations from './pages/Recommendations';
import Controversy from './pages/Controversy';
import Stats from './pages/Stats';
import Compare from './pages/Compare';
import Chat from './pages/Chat';
import Login from './pages/Login';
import { api } from './api';
import { ThemeProvider } from './ThemeContext';
import { AppConfigProvider } from './AppConfigContext';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text2)' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Something went wrong</div>
          <div style={{ fontSize: 13, marginBottom: 24 }}>{this.state.error.message}</div>
          <button className="btn btn-ghost" onClick={() => window.location.reload()}>Reload</button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AppConfigProvider>
          <AppInner />
        </AppConfigProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

function AppInner() {
  const [voter, setVoter] = useState(null); // null = checking, '' = not logged in

  useEffect(() => {
    api.me().then(d => {
      const v = d.voter || '';
      if (v) sessionStorage.setItem('voter', v);
      setVoter(v);
    }).catch(() => setVoter(''));
  }, []);

  if (voter === null) return null;
  if (!voter) return <Login onLogin={v => { sessionStorage.setItem('voter', v); setVoter(v); }} />;

  return (
    <div className="app">
      <Header voter={voter} onLogout={() => { api.logout(); sessionStorage.removeItem('voter'); setVoter(''); }} />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Navigate to="/films" replace />} />
          <Route path="/films" element={<Films />} />
          <Route path="/rankings" element={<Rankings />} />
          <Route path="/watchlist" element={<Watchlist voter={voter} />} />
          <Route path="/recommendations" element={<Recommendations />} />
          <Route path="/controversy" element={<Controversy />} />
          <Route path="/stats" element={<Stats voter={voter} />} />
          <Route path="/compare" element={<Compare />} />
          <Route path="/chat" element={<Chat voter={voter} />} />
        </Routes>
      </main>
    </div>
  );
}
