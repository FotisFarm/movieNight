import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import MovieCard from '../components/MovieCard';
import MovieModal from '../components/MovieModal';
import AddMovieModal from '../components/AddMovieModal';
import { useToast } from '../hooks/useToast.jsx';
import { useRankMap } from '../hooks/useRankMap';
import { useAppConfig } from '../AppConfigContext';
import './Films.css';

const PAGE_SIZE = 60;

const DEFAULTS = {
  search: '',
  sortBy: 'alpha',
  sortVoter: 'Φώτης',
  filterMn: false,
  filterRated: '',
  filterWl: false,
  filterVoters: [],
  filterDirector: '',
  filterYearMin: '',
  filterYearMax: '',
  filterMinVoters: '',
  filterMaxVoters: '',
};

export default function Films() {
  const { voters, minVoters } = useAppConfig();
  const [searchParams, setSearchParams] = useSearchParams();

  const [movies, setMovies]           = useState([]);
  const [allMovies, setAllMovies]     = useState([]);
  const [loading, setLoading]         = useState(true);
  const [page, setPage]               = useState(1);
  const [selectedId, setSelectedId]   = useState(null);
  const [showAdd, setShowAdd]         = useState(false);
  const [viewMode, setViewMode]       = useState('list');
  const [scoreMode, setScoreMode]     = useState('fair');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { toast, Toast }              = useToast();

  const [search, setSearch]           = useState(() => searchParams.get('q') || DEFAULTS.search);
  const [sortBy, setSortBy]           = useState(() => searchParams.get('sort') || DEFAULTS.sortBy);
  const [sortVoter, setSortVoter]     = useState(() => searchParams.get('sortVoter') || DEFAULTS.sortVoter);
  const [filterMn, setFilterMn]       = useState(() => searchParams.get('mn') === '1');
  const [filterRated, setFilterRated] = useState(() => searchParams.get('rated') || DEFAULTS.filterRated);
  const [filterWl, setFilterWl]       = useState(() => searchParams.get('wl') === '1');
  const [filterVoters, setFilterVoters] = useState(() => searchParams.get('voters') ? searchParams.get('voters').split(',') : DEFAULTS.filterVoters);
  const [filterDirector, setFilterDirector] = useState(() => searchParams.get('director') || DEFAULTS.filterDirector);
  const [filterYearMin, setFilterYearMin]   = useState(() => searchParams.get('yearMin') || DEFAULTS.filterYearMin);
  const [filterYearMax, setFilterYearMax]   = useState(() => searchParams.get('yearMax') || DEFAULTS.filterYearMax);
  const [filterMinVoters, setFilterMinVoters] = useState(() => searchParams.get('minVoters') || DEFAULTS.filterMinVoters);
  const [filterMaxVoters, setFilterMaxVoters] = useState(() => searchParams.get('maxVoters') || DEFAULTS.filterMaxVoters);
  const [directors, setDirectors]                 = useState([]);

  useEffect(() => {
    const p = {};
    if (search)                               p.q = search;
    if (sortBy !== DEFAULTS.sortBy)           p.sort = sortBy;
    if (sortVoter !== DEFAULTS.sortVoter)     p.sortVoter = sortVoter;
    if (filterMn)                             p.mn = '1';
    if (filterRated)                          p.rated = filterRated;
    if (filterWl)                             p.wl = '1';
    if (filterVoters.length)                  p.voters = filterVoters.join(',');
    if (filterDirector)                       p.director = filterDirector;
    if (filterYearMin)                        p.yearMin = filterYearMin;
    if (filterYearMax)                        p.yearMax = filterYearMax;
    if (filterMinVoters)                      p.minVoters = filterMinVoters;
    if (filterMaxVoters)                      p.maxVoters = filterMaxVoters;
    setSearchParams(p, { replace: true });
  }, [search, sortBy, sortVoter, filterMn, filterRated, filterWl, filterVoters, filterDirector, filterYearMin, filterYearMax, filterMinVoters, filterMaxVoters]);

  const searchTimer = useRef(null);

  const filtersActive = search || filterMn || filterRated || filterWl || filterVoters.length || filterDirector || filterYearMin || filterYearMax || filterMinVoters || filterMaxVoters;

  const activeFilterCount = [
    filterMn, filterWl, filterVoters.length > 0,
    !!filterDirector, !!filterYearMin, !!filterYearMax,
    !!filterMinVoters, !!filterMaxVoters, !!filterRated,
  ].filter(Boolean).length;

  const setters = { search: setSearch, sortBy: setSortBy, sortVoter: setSortVoter, filterMn: setFilterMn, filterRated: setFilterRated, filterWl: setFilterWl, filterVoters: setFilterVoters, filterDirector: setFilterDirector, filterYearMin: setFilterYearMin, filterYearMax: setFilterYearMax, filterMinVoters: setFilterMinVoters, filterMaxVoters: setFilterMaxVoters };
  function resetFilters() {
    Object.entries(DEFAULTS).forEach(([k, v]) => setters[k](v));
  }
  function toggleVoter(v) {
    setFilterVoters(vs => vs.includes(v) ? vs.filter(x => x !== v) : [...vs, v]);
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
    fetchMovies({});
    refreshAllMovies();
    api.getDirectors().then(setDirectors).catch(() => {});
  }, [fetchMovies]);

  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      fetchMovies({
        mn:         filterMn        ? '1' : undefined,
        watchlist:  filterWl        ? '1' : undefined,
        rated:      filterRated     || undefined,
        voters:     filterVoters.length ? filterVoters.join(',') : undefined,
        director:   filterDirector  || undefined,
        yearMin:    filterYearMin   || undefined,
        yearMax:    filterYearMax   || undefined,
        minVoters:  filterMinVoters || undefined,
        maxVoters:  filterMaxVoters || undefined,
      });
    }, 250);
  }, [search, filterMn, filterWl, filterRated, filterVoters, filterDirector, filterYearMin, filterYearMax, filterMinVoters, filterMaxVoters, fetchMovies]);

  const rankMap = useRankMap(allMovies);

  function tiebreakScore(a, b) {
    if (b.voterCount !== a.voterCount) return b.voterCount - a.voterCount;
    if ((b.boost ?? 0) !== (a.boost ?? 0)) return (b.boost ?? 0) - (a.boost ?? 0);
    return (parseInt(a.year) || 9999) - (parseInt(b.year) || 9999);
  }

  // For the per-voter sort: tie → better top-10 pick wins, then oldest year
  function voterTiebreak(a, b) {
    const ra = a.top3?.[sortVoter] ?? 99;
    const rb = b.top3?.[sortVoter] ?? 99;
    if (ra !== rb) return ra - rb;
    return (parseInt(a.year) || 9999) - (parseInt(b.year) || 9999);
  }

  const searchFiltered = search
    ? movies.filter(m => {
        const q = search.toLowerCase();
        return m.title.toLowerCase().includes(q) || m.director?.toLowerCase().includes(q);
      })
    : movies;

  const scoreSortActive = sortBy === 'score-desc' || sortBy === 'score-asc' || sortBy === 'group-desc' || sortBy === 'group-asc' || sortBy === 'controversial';
  const sortBase = scoreSortActive && filterRated !== 'unvoted' ? searchFiltered.filter(m => m.voterCount >= minVoters) : searchFiltered;

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
      case 'voter-desc':   return ((b.ratings?.[sortVoter] ?? -1) - (a.ratings?.[sortVoter] ?? -1)) || voterTiebreak(a, b);
      case 'voter-asc':    return ((a.ratings?.[sortVoter] ?? 11) - (b.ratings?.[sortVoter] ?? 11)) || voterTiebreak(a, b);
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
        <button
          className={`btn btn-ghost filters-toggle-btn${activeFilterCount > 0 ? ' filters-toggle-active' : ''}`}
          onClick={() => setSidebarOpen(o => !o)}
        >
          Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
        </button>

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

      {/* Two-column layout: sidebar + content */}
      <div className="films-layout">

        <aside className={`films-sidebar${sidebarOpen ? ' films-sidebar--open' : ''}`}>

          {/* Sort */}
          <div className="filter-group">
            <span className="filter-group-label">Sort</span>
            <select className="select select-sm filter-group-control" value={sortBy} onChange={e => setSortBy(e.target.value)}>
              <option value="alpha">A → Z</option>
              <option value="alpha-dir">By Director</option>
              <option value="year-desc">Newest</option>
              <option value="year-asc">Oldest</option>
              <option value="score-desc">Fair Score ↓</option>
              <option value="score-asc">Fair Score ↑</option>
              <option value="group-desc">Group Score ↓</option>
              <option value="group-asc">Group Score ↑</option>
              <option value="voter-desc">Voter Rating ↓</option>
              <option value="voter-asc">Voter Rating ↑</option>
              <option value="controversial">Most Controversial</option>
              <option value="added-desc">Recently Added</option>
              <option value="added-asc">First Added</option>
            </select>
            {(sortBy === 'voter-desc' || sortBy === 'voter-asc') && (
              <>
                <span className="filter-group-label" style={{ marginTop: 8 }}>By voter</span>
                <select className="select select-sm filter-group-control" value={sortVoter} onChange={e => setSortVoter(e.target.value)}>
                  {voters.map(v => <option key={v}>{v}</option>)}
                </select>
              </>
            )}
          </div>

          <div className="filter-divider" />

          {/* Quick toggles */}
          <div className="filter-group">
            <label className="filter-check filter-check-mn">
              <input type="checkbox" checked={filterMn} onChange={e => setFilterMn(e.target.checked)} />
              Movie Night
            </label>
            <label className="filter-check" style={{ marginTop: 6 }}>
              <input type="checkbox" checked={filterWl} onChange={e => setFilterWl(e.target.checked)} />
              Watchlist
            </label>
          </div>

          <div className="filter-divider" />

          {/* Voted */}
          <div className="filter-group">
            <label className="filter-group-label" htmlFor="filter-voted">Voted</label>
            <select id="filter-voted" className="select select-sm filter-group-control"
              value={filterRated} onChange={e => setFilterRated(e.target.value)}>
              <option value="">Any</option>
              <option value="voted">Voted</option>
              <option value="unvoted">Unvoted</option>
            </select>
          </div>

          {/* By voter */}
          <div className="filter-group">
            <span className="filter-group-label">By voter</span>
            <div className="filter-voters">
              {voters.map(v => (
                <button
                  key={v}
                  type="button"
                  className={`voter-pill${filterVoters.includes(v) ? ' active' : ''}`}
                  onClick={() => toggleVoter(v)}
                  title={`Films ${v} has rated`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          <div className="filter-divider" />

          {/* Director */}
          <div className="filter-group">
            <label className="filter-group-label" htmlFor="filter-director">Director</label>
            <select id="filter-director" className="select select-sm filter-group-control"
              value={filterDirector} onChange={e => setFilterDirector(e.target.value)}>
              <option value="">All</option>
              {directors.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          {/* Year */}
          <div className="filter-group">
            <span className="filter-group-label">Year</span>
            <div className="filter-range-row">
              <input className="input input-sm" placeholder="From"
                value={filterYearMin} onChange={e => setFilterYearMin(e.target.value)} />
              <span className="filter-range-sep">–</span>
              <input className="input input-sm" placeholder="To"
                value={filterYearMax} onChange={e => setFilterYearMax(e.target.value)} />
            </div>
          </div>

          {/* Voters */}
          <div className="filter-group">
            <span className="filter-group-label">Voters</span>
            <div className="filter-range-row">
              <select className="select select-sm" value={filterMinVoters} onChange={e => setFilterMinVoters(e.target.value)}>
                <option value="">Min</option>
                <option value="1">≥ 1</option>
                <option value="2">≥ 2</option>
                <option value="3">≥ 3</option>
                <option value="4">≥ 4</option>
                <option value="5">≥ 5</option>
              </select>
              <span className="filter-range-sep">–</span>
              <select className="select select-sm" value={filterMaxVoters} onChange={e => setFilterMaxVoters(e.target.value)}>
                <option value="">Max</option>
                <option value="0">0</option>
                <option value="1">≤ 1</option>
                <option value="2">≤ 2</option>
                <option value="3">≤ 3</option>
                <option value="4">≤ 4</option>
                <option value="5">≤ 5</option>
              </select>
            </div>
          </div>

          <div className="filter-divider" />

          {/* Footer */}
          <div className="filter-footer">
            <button
              className={`btn btn-sm${filtersActive ? ' btn-ghost filter-reset-active' : ' btn-ghost'}`}
              onClick={resetFilters}
              disabled={!filtersActive}
            >
              Reset
            </button>
            <span className="filter-count">{searchFiltered.length} / {movies.length}</span>
          </div>

        </aside>

        {/* Main content */}
        <div className="films-main">
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
                {visible.map((m) => (
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
        </div>

      </div>

      {selectedId && (
        <MovieModal
          movieId={selectedId}
          onClose={() => setSelectedId(null)}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
          rankData={{
            fair:    rankMap.fair[selectedId]    ?? null,
            group:   rankMap.group[selectedId]   ?? null,
            mnFair:  rankMap.mnFair[selectedId]  ?? null,
            mnGroup: rankMap.mnGroup[selectedId] ?? null,
          }}
        />
      )}
      {showAdd && (
        <AddMovieModal onClose={() => setShowAdd(false)} onAdded={handleAdded} />
      )}
      <Toast />
    </div>
  );
}
