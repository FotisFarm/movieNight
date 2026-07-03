import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../api';
import RankingSection from '../components/RankingSection';
import MovieModal from '../components/MovieModal';
import DirectorYearModal from '../components/DirectorYearModal';
import { useToast } from '../hooks/useToast.jsx';
import './Rankings.css';

const ROWS = [
  {
    label: 'Group Score — All Films',
    description: 'Score calculated as if the whole group always votes (sum ÷ group size), plus a Top 10 token bonus: 🥇+1.0 down to #10 +0.1, capped at 10. Films not yet seen by the whole group are penalised — a deliberate measure of collective buy-in.',
    rowScoreKey: 'boostedScore', mnOnly: false,
    panels: [
      { title: '🏆 Top 10 Films',  key: 'groupAll',      scoreKey: 'boostedScore', clickable: true },
      { title: '🎭 Top Directors', key: 'groupDirsAll',  scoreKey: 'avg' },
      { title: '📅 Top Years',     key: 'groupYearsAll', scoreKey: 'avg' },
      { title: '📆 Top Decades',   key: 'groupDecadesAll', scoreKey: 'avg' },
    ],
  },
  {
    label: 'Group Score — Movie Nights Only',
    description: 'Group formula (÷5, Top 10 token bonus 🥇+1.0 … #10 +0.1, capped at 10) restricted to Movie Night films.',
    rowScoreKey: 'boostedScore', mnOnly: true,
    panels: [
      { title: '🏆 Top 10 Films',  key: 'groupMn',      scoreKey: 'boostedScore', clickable: true },
      { title: '🎭 Top Directors', key: 'groupDirsMn',  scoreKey: 'avg' },
      { title: '📅 Top Years',     key: 'groupYearsMn', scoreKey: 'avg' },
      { title: '📆 Top Decades',   key: 'groupDecadesMn', scoreKey: 'avg' },
    ],
  },
  {
    label: 'Fair Score — All Films',
    description: 'Average of actual votes cast (÷ number of voters), plus a Top 10 token bonus: #1 +1.0 down to #10 +0.1 (−0.1 per rank). Scores are capped at 10. Films rated by fewer than 2 people are excluded.',
    rowScoreKey: 'fairBoosted', mnOnly: false,
    panels: [
      { title: '🏆 Top 10 Films',  key: 'fairAll',      scoreKey: 'fairBoosted', clickable: true },
      { title: '🎭 Top Directors', key: 'fairDirsAll',  scoreKey: 'avg' },
      { title: '📅 Top Years',     key: 'fairYearsAll', scoreKey: 'avg' },
      { title: '📆 Top Decades',   key: 'fairDecadesAll', scoreKey: 'avg' },
    ],
  },
  {
    label: 'Fair Score — Movie Nights Only',
    description: 'Same formula (÷ voters, Top 10 token bonus 🥇+1.0 … #10 +0.1, capped at 10), restricted to films screened during a Movie Night session.',
    rowScoreKey: 'fairBoosted', mnOnly: true,
    panels: [
      { title: '🏆 Top 10 Films',  key: 'fairMn',      scoreKey: 'fairBoosted', clickable: true },
      { title: '🎭 Top Directors', key: 'fairDirsMn',  scoreKey: 'avg' },
      { title: '📅 Top Years',     key: 'fairYearsMn', scoreKey: 'avg' },
      { title: '📆 Top Decades',   key: 'fairDecadesMn', scoreKey: 'avg' },
    ],
  },
];

const PANEL_TYPES = [
  { key: 'films',    label: '🏆 Films' },
  { key: 'directors', label: '🎭 Directors' },
  { key: 'years',    label: '📅 Years' },
  { key: 'decades',  label: '📆 Decades' },
];

function panelType(panelKey) {
  if (panelKey.includes('Dirs'))    return 'directors';
  if (panelKey.includes('Decades')) return 'decades';
  if (panelKey.includes('Years'))   return 'years';
  return 'films';
}

export default function Rankings() {
  const [data, setData]               = useState(null);
  const [loading, setLoading]         = useState(true);
  const [selectedId, setSelectedId]   = useState(null);
  const [selectedLabel, setSelectedLabel] = useState(null);
  const [minDirFilms, setMinDirFilms] = useState(() => parseInt(localStorage.getItem('mn_minDirFilms')) || 2);
  const [visibleTypes, setVisibleTypes] = useState(() => {
    try { return JSON.parse(localStorage.getItem('mn_rankPanels')) || ['films']; }
    catch { return ['films']; }
  });
  const { toast, Toast }              = useToast();
  const location                      = useLocation();

  useEffect(() => {
    setLoading(true);
    api.getRankings({ minDirFilms })
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [location.key, minDirFilms]);

  function changeMinDirFilms(n) {
    setMinDirFilms(n);
    localStorage.setItem('mn_minDirFilms', n);
  }

  function togglePanelType(type) {
    setVisibleTypes(prev => {
      const next = prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type];
      const result = next.length ? next : ['films'];
      localStorage.setItem('mn_rankPanels', JSON.stringify(result));
      return result;
    });
  }

  function handleSaved() {
    toast('Saved!');
    api.getRankings({ minDirFilms }).then(setData).catch(console.error);
  }

  if (loading) return <div className="spinner" />;

  if (!data) return (
    <div className="empty">
      <div className="empty-icon">📊</div>
      <div className="empty-title">Couldn't load rankings</div>
    </div>
  );

  return (
    <div className="rankings-rows">
      <div className="ranking-controls">
        <label className="filter-item">
          Min films
          <select className="select select-sm" value={minDirFilms} onChange={e => changeMinDirFilms(parseInt(e.target.value))}>
            {[1, 2, 3, 4].map(n => (
              <option key={n} value={n}>{n === 1 ? 'No minimum' : `${n} films`}</option>
            ))}
          </select>
        </label>
        <div className="filter-sep" />
        <span style={{ fontSize: 12, color: 'var(--text3)', marginRight: 4 }}>Show</span>
        {PANEL_TYPES.map(({ key, label }) => (
          <button
            key={key}
            className={`btn btn-sm ${visibleTypes.includes(key) ? 'btn-rank-active' : 'btn-ghost'}`}
            onClick={() => togglePanelType(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {ROWS.map(row => (
        <div key={row.label} className="ranking-row-group">
          <div className="ranking-row-header">
            <h2 className="ranking-row-title">{row.label}</h2>
            <p className="ranking-row-desc">{row.description}</p>
          </div>
          <div className="ranking-row-panels">
            {row.panels.filter(panel => visibleTypes.includes(panelType(panel.key))).map(panel => (
              <RankingSection
                key={panel.key}
                title={panel.title}
                rows={data[panel.key]}
                scoreKey={panel.scoreKey}
                rowScoreKey={row.rowScoreKey}
                mn={row.mnOnly}
                onMovieClick={panel.clickable ? setSelectedId : undefined}
                onDirectorClick={(d, sk, mnOnly) => setSelectedLabel({ type: 'director', value: d, scoreKey: sk, mnOnly })}
                onYearClick={(y, sk, mnOnly) => setSelectedLabel({ type: 'year', value: String(y), scoreKey: sk, mnOnly })}
                onDecadeClick={(d, sk, mnOnly) => setSelectedLabel({ type: 'decade', value: parseInt(d), scoreKey: sk, mnOnly })}
              />
            ))}
          </div>
        </div>
      ))}

      {selectedId && (
        <MovieModal
          movieId={selectedId}
          onClose={() => setSelectedId(null)}
          onSaved={handleSaved}
          onDeleted={() => { setSelectedId(null); api.getRankings({ minDirFilms }).then(setData); }}
        />
      )}
      {selectedLabel && (
        <DirectorYearModal
          type={selectedLabel.type}
          value={selectedLabel.value}
          scoreKey={selectedLabel.scoreKey}
          mnOnly={selectedLabel.mnOnly}
          onClose={() => setSelectedLabel(null)}
        />
      )}
      <Toast />
    </div>
  );
}
