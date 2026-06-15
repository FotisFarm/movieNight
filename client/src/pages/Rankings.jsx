import { useState, useEffect } from 'react';
import { api } from '../api';
import RankingSection from '../components/RankingSection';
import MovieModal from '../components/MovieModal';
import DirectorYearModal from '../components/DirectorYearModal';
import { useToast } from '../hooks/useToast.jsx';
import './Rankings.css';

const ROWS = [
  {
    label: 'Group Score — All Films',
    description: 'Score calculated as if all 5 members always vote (sum ÷ 5), plus a Top 3 token bonus: 🥇+1.0 · 🥈+0.6 · 🥉+0.4, capped at 10. Films not yet seen by the whole group are penalised — a deliberate measure of collective buy-in.',
    panels: [
      { title: '🏆 Top 10 Films',  key: 'groupAll',     scoreKey: 'boostedScore', clickable: true },
      { title: '🎭 Top Directors', key: 'groupDirsAll', scoreKey: 'avg' },
      { title: '📅 Top Years',     key: 'groupYearsAll', scoreKey: 'avg' },
    ],
  },
  {
    label: 'Group Score — Movie Nights Only',
    description: 'Group formula (÷5, 🥇+1.0 · 🥈+0.6 · 🥉+0.4, capped at 10) restricted to Movie Night films.',
    panels: [
      { title: '🏆 Top 10 Films',  key: 'groupMn',     scoreKey: 'boostedScore', clickable: true },
      { title: '🎭 Top Directors', key: 'groupDirsMn', scoreKey: 'avg' },
      { title: '📅 Top Years',     key: 'groupYearsMn', scoreKey: 'avg' },
    ],
  },
  {
    label: 'Fair Score — All Films',
    description: 'Average of actual votes cast (÷ number of voters), plus a Top 3 token bonus: 🥇 Gold +1.0 · 🥈 Silver +0.6 · 🥉 Bronze +0.4. Scores are capped at 10. Films rated by fewer than 2 people are excluded.',
    panels: [
      { title: '🏆 Top 10 Films',  key: 'fairAll',     scoreKey: 'fairBoosted', clickable: true },
      { title: '🎭 Top Directors', key: 'fairDirsAll', scoreKey: 'avg' },
      { title: '📅 Top Years',     key: 'fairYearsAll', scoreKey: 'avg' },
    ],
  },
  {
    label: 'Fair Score — Movie Nights Only',
    description: 'Same formula (÷ voters, 🥇+1.0 · 🥈+0.6 · 🥉+0.4, capped at 10), restricted to films screened during a Movie Night session.',
    panels: [
      { title: '🏆 Top 10 Films',  key: 'fairMn',     scoreKey: 'fairBoosted', clickable: true },
      { title: '🎭 Top Directors', key: 'fairDirsMn', scoreKey: 'avg' },
      { title: '📅 Top Years',     key: 'fairYearsMn', scoreKey: 'avg' },
    ],
  },
];

export default function Rankings() {
  const [data, setData]               = useState(null);
  const [loading, setLoading]         = useState(true);
  const [selectedId, setSelectedId]   = useState(null);
  const [selectedLabel, setSelectedLabel] = useState(null);
  const { toast, Toast }              = useToast();

  useEffect(() => {
    api.getRankings()
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  function handleSaved() {
    toast('Saved!');
    api.getRankings().then(setData).catch(console.error);
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
      {ROWS.map(row => (
        <div key={row.label} className="ranking-row-group">
          <div className="ranking-row-header">
            <h2 className="ranking-row-title">{row.label}</h2>
            <p className="ranking-row-desc">{row.description}</p>
          </div>
          <div className="ranking-row-panels">
            {row.panels.map(panel => (
              <RankingSection
                key={panel.key}
                title={panel.title}
                rows={data[panel.key]}
                scoreKey={panel.scoreKey}
                onMovieClick={panel.clickable ? setSelectedId : undefined}
                onDirectorClick={d => setSelectedLabel({ type: 'director', value: d })}
                onYearClick={y => setSelectedLabel({ type: 'year', value: String(y) })}
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
          onDeleted={() => { setSelectedId(null); api.getRankings().then(setData); }}
        />
      )}
      {selectedLabel && (
        <DirectorYearModal
          type={selectedLabel.type}
          value={selectedLabel.value}
          onClose={() => setSelectedLabel(null)}
        />
      )}
      <Toast />
    </div>
  );
}
