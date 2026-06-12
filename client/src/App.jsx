import { Routes, Route, Navigate } from 'react-router-dom';
import Header from './components/Header';
import Films from './pages/Films';
import Rankings from './pages/Rankings';
import Watchlist from './pages/Watchlist';

export default function App() {
  return (
    <div className="app">
      <Header />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Navigate to="/films" replace />} />
          <Route path="/films" element={<Films />} />
          <Route path="/rankings" element={<Rankings />} />
          <Route path="/watchlist" element={<Watchlist />} />
        </Routes>
      </main>
    </div>
  );
}
