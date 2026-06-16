import { useState, useEffect } from 'react';
import { api } from '../api';
import MovieModal from '../components/MovieModal';
import { useToast } from '../hooks/useToast.jsx';
import './Controversy.css';

const VOTERS = ['Μητσέας', 'Παντελής', 'Στέλιας', 'Φώτης', 'Λεόντιος'];

function stdDevClass(v) {
  if (v == null) return 'score-none';
  if (v < 1)  return 'score-high';
  if (v < 2)  return 'score-mid';
  return 'score-low';
}

function scoreClass(v) {
  if (v == null) return 'score-none';
  if (v >= 7.5) return 'score-high';
  if (v >= 5)   return 'score-mid';
  return 'score-low';
}

function fmt(v) {
  if (v == null) return '–';
  return v.toFixed(2).replace('.', ',');
}

export default function Controversy() {
  const [allFilms, setAllFilms] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [modalId, setModalId]   = useState(null);
  const [filterMn, setFilterMn] = useState(false);
  const [minVoters, setMinVoters] = useState(2);
  const { toast, Toast }        = useToast();

  useEffect(() => {
    api.getMovies({ rated: '1' })
      .then(data => setAllFilms(data.filter(m => m.voterCount >= 2 && m.stdDev != null)))
      .finally(() => setLoading(false));
  }, []);

  function handleSaved(updated) {
    setAllFilms(fs => fs.map(f => f.id === updated.id ? { ...f, ...updated } : f));
    toast('Saved!');
  }
  function handleDeleted(id) {
    setAllFilms(fs => fs.filter(f => f.id !== id));
  }

  const films = allFilms
    .filter(f => {
      if (filterMn && !f.mn) return false;
      if (f.voterCount < minVoters) return false;
      return true;
    })
    .sort((a, b) => b.stdDev - a.stdDev);

  return (
    <div>
      <Toast />

      <div className="films-filters">
        <div className="filter-row">
          <label className="filter-check filter-check-mn">
            <input type="checkbox" checked={filterMn} onChange={e => setFilterMn(e.target.checked)} />
            Movie Night
          </label>
          <div className="filter-sep" />
          <label className="filter-item">
            Min voters
            <select className="select select-sm" value={minVoters} onChange={e => setMinVoters(parseInt(e.target.value))}>
              {[2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <span className="filter-count">{films.length} films</span>
        </div>
      </div>

      <div className="controversy-page">
        <div className="recs-header">
          <h1 className="recs-title">Controversy</h1>
          <p className="recs-sub">Films ranked by score variance — highest disagreement first</p>
        </div>

        {loading ? (
          <div className="spinner" style={{ margin: '60px auto' }} />
        ) : films.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--text2)', marginTop: 60 }}>No films match your filters.</p>
        ) : (
          <ol className="controversy-list">
            {films.map((f, i) => (
              <li key={f.id} className="controversy-row" onClick={() => setModalId(f.id)}>
                <span className="controversy-rank">#{i + 1}</span>
                <div className="controversy-info">
                  <div className="controversy-title-row">
                    <span className="controversy-title">{f.title}</span>
                    {f.mn && <span className="badge badge-mn">MN</span>}
                  </div>
                  <span className="controversy-meta">{f.director}{f.year ? ` · ${f.year}` : ''}</span>
                </div>
                <div className="controversy-std">
                  <span className={`controversy-std-val ${stdDevClass(f.stdDev)}`}>±{fmt(f.stdDev)}</span>
                  <span className="controversy-std-lbl">std dev</span>
                </div>
                <div className="controversy-scores">
                  {VOTERS.map(v => {
                    const score = f.ratings?.[v];
                    if (score == null) return (
                      <span key={v} className="controversy-pill controversy-pill-empty">
                        <span className="controversy-voter">{v.slice(0, 3)}</span>
                      </span>
                    );
                    return (
                      <span key={v} className={`controversy-pill ${scoreClass(score)}`}>
                        <span className="controversy-voter">{v.slice(0, 3)}</span>
                        <span className="controversy-score">{Number.isInteger(score) ? score : score.toFixed(1)}</span>
                      </span>
                    );
                  })}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      {modalId && (
        <MovieModal
          movieId={modalId}
          onClose={() => setModalId(null)}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  );
}
