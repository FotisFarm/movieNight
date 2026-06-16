import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { api } from '../api';
import MovieCard from '../components/MovieCard';
import MovieModal from '../components/MovieModal';
import AddMovieModal from '../components/AddMovieModal';
import { useToast } from '../hooks/useToast.jsx';
import './Films.css';

const PAGE_SIZE = 60;

const DEFAULTS = {
  search: '',
  sortBy: 'alpha',
  filterMn: false,
  filterRated: false,
  filterWl: false,
  filterVoter: '',
  filterDir: '',
  filterYear: '',
};

export default function Films() {
  const [movies, setMovies]           = useState([]);
  const [allMovies, setAllMovies]     = useState([]);
  const [directors, setDirectors]     = useState([]);
  const [loading, setLoading]         = useState(true);
  const [page, setPage]               = useState(1);
  const [selectedId, setSelectedId]   = useState(null);
  const [showAdd, setShowAdd]         = useState(false);
  const [viewMode, setViewMode]       = useState('list');
  const [scoreMode, setScoreMode]     = useState('fair');
  const { toast, Toast }              = useToast();

  const [search, setSearch]           = useState(DEFAULTS.search);
  const [sortBy, setSortBy]           = useState(DEFAULTS.sortBy);
  const [filterMn, setFilterMn]       = useState(DEFAULTS.filterMn);
  const [filterRated, setFilterRated] = useState(DEFAULTS.filterRated);
  const [filterWl, setFilterWl]       = useState(DEFAULTS.filterWl);
  const [filterVoter, setFilterVoter] = useState(DEFAULTS.filterVoter);
  const [filterDir, setFilterDir]     = useState(DEFAULTS.filterDir);
  const [filterYear, setFilterYear]   = useState(DEFAULTS.filterYear);

  const searchTimer = useRef(null);

  const filtersActive = search || filterMn || filterRated || filterWl || filterVoter || filterDir || filterYear;

  const setters = { search: setSearch, sortBy: setSortBy, filterMn: setFilterMn, filterRated: setFilterRated, filterWl: setFilterWl, filterVoter: setFilterVoter, filterDir: setFilterDir, filterYear: setFilterYear };
  function resetFilters() {
    Object.entries(DEFAULTS).forEach(([k, v]) => setters[k](v));
  }

  const fetchMovies = useCallback(async (params) => {
    setLoading(true);
    try {
      const data = await api.getMovies(params);
      setMovies(data);
      setPage(1);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  function refreshAllMovies() {
    api.getMovies({}).then(setAllMovies).catch(() => {});
  }

  useEffect(() => {
    api.getDirectors().then(setDirectors).catch(() => {});
    fetchMovies({});
    refreshAllMovies();
  }, [fetchMovies]);

  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      fetchMovies({
        mn:        filterMn    ? '1' : undefined,
        watchlist: filterWl    ? '1' : undefined,
        rated:     filterRated ? '1' : undefined,
        voter:     filterVoter || undefined,
        director:  filterDir   || undefined,
        year:      filterYear  || undefined,
      });
    }, 250);
  }, [search, filterMn, filterWl, filterRated, filterVoter, filterDir, filterYear, fetchMovies]);

  const rankMap = useMemo(() => {
    const rated   = allMovies.filter(m => m.voterCount >= 2);
    const ratedMn = rated.filter(m => m.mn);
    function tiebreak(a, b) {
      if (b.voterCount !== a.voterCount) return b.voterCount - a.voterCount;
      if ((b.boost ?? 0) !== (a.boost ?? 0)) return (b.boost ?? 0) - (a.boost ?? 0);
      return (parseInt(a.year) || 9999) - (parseInt(b.year) || 9999);
    }
    const byFair  = (a, b) => (b.fairBoosted  - a.fairBoosted)  || tiebreak(a, b);
    const byGroup = (a, b) => (b.boostedScore - a.boostedScore) || tiebreak(a, b);
    const toMap   = arr => { const m = {}; arr.forEach((x, i) => { m[x.id] = i + 1; }); return m; };
    return {
      fair:    toMap([...rated].sort(byFair)),
      group:   toMap([...rated].sort(byGroup)),
      mnFair:  toMap([...ratedMn].sort(byFair)),
      mnGroup: toMap([...ratedMn].sort(byGroup)),
    };
  }, [allMovies]);

  function tiebreakScore(a, b) {
    if (b.voterCount !== a.voterCount) return b.voterCount - a.voterCount;
    if ((b.boost ?? 0) !== (a.boost ?? 0)) return (b.boost ?? 0) - (a.boost ?? 0);
    return (parseInt(a.year) || 9999) - (parseInt(b.year) || 9999);
  }

  const searchFiltered = search
    ? movies.filter(m => {
        const q = search.toLowerCase();
        return m.title.toLowerCase().includes(q) || m.director?.toLowerCase().includes(q);
      })
    : movies;

  const scoreSortActive = sortBy === 'score-desc' || sortBy === 'score-asc' || sortBy === 'group-desc' || sortBy === 'group-asc' || sortBy === 'controversial';
  const sortBase = scoreSortActive ? searchFiltered.filter(m => m.voterCount >= 2) : searchFiltered;

  const sorted = [...sortBase].sort((a, b) => {
    switch (sortBy) {
      case 'alpha':      return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
      case 'alpha-dir': {
        const d = a.director.localeCompare(b.director, undefined, { sensitivity: 'base' });
        return d || a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
      }
      case 'year-desc':  return (parseInt(b.year) || 0) - (parseInt(a.year) || 0);
      case 'year-asc':   return (parseInt(a.year) || 0) - (parseInt(b.year) || 0);
      case 'score-desc': return (b.fairBoosted  - a.fairBoosted)  || tiebreakScore(a, b);
      case 'score-asc':  return (a.fairBoosted  - b.fairBoosted)  || tiebreakScore(b, a);
      case 'group-desc': return (b.boostedScore - a.boostedScore) || tiebreakScore(a, b);
      case 'group-asc':  return (a.boostedScore - b.boostedScore) || tiebreakScore(b, a);
      case 'added-desc':   return b.id - a.id;
      case 'added-asc':    return a.id - b.id;
      case 'controversial': return (b.stdDev ?? -1) - (a.stdDev ?? -1);
      default: return 0;
    }
  });

  const visible = sorted.slice(0, page * PAGE_SIZE);
  const hasMore = sorted.length > visible.length;

  function handleSaved(updated) {
    setMovies(ms => ms.map(m => m.id === updated.id ? updated : m));
    setAllMovies(ms => ms.map(m => m.id === updated.id ? updated : m));
    toast('Saved!');
  }

  function handleDeleted(id) {
    setMovies(ms => ms.filter(m => m.id !== id));
    toast('Film deleted.');
  }

  function handleAdded(movie) {
    setMovies(ms => [movie, ...ms]);
    toast(`"${movie.title}" added!`);
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="films-toolbar">
        <div className="search-box">
          <span className="search-icon">🔍</span>
          <input
            className="input search-input"
            placeholder="Search films, directors…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className="search-clear" onClick={() => setSearch('')}>✕</button>
          )}
        </div>

        <div className="view-toggle">
          <button className={`view-btn${scoreMode === 'fair' ? ' active' : ''}`}
            onClick={() => setScoreMode('fair')} title="Fair: per-voter average + Top 3 token bonus">
            Fair
          </button>
          <button className={`view-btn${scoreMode === 'group' ? ' active' : ''}`}
            onClick={() => setScoreMode('group')} title="Group: sum ÷ 5 + Top 3 token bonus (penalises films not seen by all)">
            Group
          </button>
        </div>

        <div className="view-toggle">
          <button className={`view-btn${viewMode === 'list' ? ' active' : ''}`}
            onClick={() => setViewMode('list')} title="List view">☰</button>
          <button className={`view-btn${viewMode === 'grid' ? ' active' : ''}`}
            onClick={() => setViewMode('grid')} title="Grid view">⊞</button>
        </div>

        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ Add Film</button>
      </div>

      {/* Filters */}
      <div className="films-filters">
        <div className="filter-row">
          <label className="filter-item">
            Sort
            <select className="select select-sm" value={sortBy} onChange={e => {
              setSortBy(e.target.value);
              if (e.target.value === 'score-desc' || e.target.value === 'score-asc') setScoreMode('fair');
              if (e.target.value === 'group-desc' || e.target.value === 'group-asc') setScoreMode('group');
            }}>
              <option value="alpha">A → Z</option>
              <option value="alpha-dir">By Director</option>
              <option value="year-desc">Newest</option>
              <option value="year-asc">Oldest</option>
              <option value="score-desc">Fair Score ↓</option>
              <option value="score-asc">Fair Score ↑</option>
              <option value="group-desc">Group Score ↓</option>
              <option value="group-asc">Group Score ↑</option>
              <option value="controversial">Most Controversial</option>
              <option value="added-desc">Recently Added</option>
              <option value="added-asc">First Added</option>
            </select>
          </label>

          <div className="filter-sep" />

          <label className="filter-check filter-check-mn">
            <input type="checkbox" checked={filterMn} onChange={e => setFilterMn(e.target.checked)} />
            Movie Night
          </label>
          <label className="filter-check">
            <input type="checkbox" checked={filterRated} onChange={e => setFilterRated(e.target.checked)} />
            Rated only
          </label>
          <label className="filter-check">
            <input type="checkbox" checked={filterWl} onChange={e => setFilterWl(e.target.checked)} />
            Watchlist
          </label>

          <div className="filter-sep" />

          <label className="filter-item">
            Voter
            <select className="select select-sm" value={filterVoter} onChange={e => setFilterVoter(e.target.value)}>
              <option value="">All</option>
              {['Μητσέας','Παντελής','Στέλιας','Φώτης','Λεόντιος'].map(v => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>

          <label className="filter-item">
            Director
            <select className="select select-sm" value={filterDir} onChange={e => setFilterDir(e.target.value)}>
              <option value="">All</option>
              {directors.map(d => <option key={d}>{d}</option>)}
            </select>
          </label>

          <label className="filter-item">
            Year
            <input className="input input-sm" style={{ width: 74 }} placeholder="1972"
              value={filterYear} onChange={e => setFilterYear(e.target.value)} />
          </label>

          <div className="filter-sep" />

          <button
            className={`btn btn-sm${filtersActive ? ' btn-ghost filter-reset-active' : ' btn-ghost'}`}
            onClick={resetFilters}
            disabled={!filtersActive}
          >
            Reset
          </button>

          <span className="filter-count">{searchFiltered.length} / {movies.length} films</span>
        </div>
      </div>

      {/* Film list / grid */}
      {loading ? (
        <div className="spinner" />
      ) : sorted.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">🎬</div>
          <div className="empty-title">No films found</div>
          <div>Try adjusting your filters</div>
        </div>
      ) : (
        <>
          <div className={viewMode === 'grid' ? 'films-grid' : 'films-list'}>
            {visible.map(m => (
              <MovieCard
                key={m.id}
                movie={{
                  ...m,
                  rank_global: (scoreMode === 'group' ? rankMap.group   : rankMap.fair  )[m.id] ?? null,
                  mn_rank:     (scoreMode === 'group' ? rankMap.mnGroup : rankMap.mnFair)[m.id] ?? null,
                }}
                onClick={() => setSelectedId(m.id)}
                listView={viewMode === 'list'}
                scoreMode={scoreMode}
              />
            ))}
          </div>
          {hasMore && (
            <div style={{ textAlign: 'center', marginTop: 24 }}>
              <button className="btn btn-ghost" onClick={() => setPage(p => p + 1)}>
                Load more ({sorted.length - visible.length} remaining)
              </button>
            </div>
          )}
        </>
      )}

      {selectedId && (
        <MovieModal
          movieId={selectedId}
          onClose={() => setSelectedId(null)}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      )}
      {showAdd && (
        <AddMovieModal onClose={() => setShowAdd(false)} onAdded={handleAdded} />
      )}
      <Toast />
    </div>
  );
}
