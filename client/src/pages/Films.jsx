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
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(() =>
    !!(searchParams.get('director') || searchParams.get('yearMin') || searchParams.get('yearMax') || searchParams.get('minVoters') || searchParams.get('maxVoters'))
  );
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
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

  const advancedFilterCount = [
    !!filterDirector, !!filterYearMin, !!filterYearMax,
    !!filterMinVoters, !!filterMaxVoters,
  ].filter(Boolean).length;

  const filtersActive = search || filterMn || filterRated || filterWl || filterVoters.length || advancedFilterCount > 0;

  const activeFilterCount = [
    filterMn, filterWl, filterVoters.length > 0,
    !!filterRated, advancedFilterCount > 0,
  ].filter(Boolean).length;

  const setters = { search: setSearch, sortBy: setSortBy, sortVoter: setSortVoter, filterMn: setFilterMn, filterRated: setFilterRated, filterWl: setFilterWl, filterVoters: setFilterVoters, filterDirector: setFilterDirector, filterYearMin: setFilterYearMin, filterYearMax: setFilterYearMax, filterMinVoters: setFilterMinVoters, filterMaxVoters: setFilterMaxVoters };
  function resetFilters() {
    Object.entries(DEFAULTS).forEach(([k, v]) => setters[k](v));
  }
  function toggleVoter(v, e) {
    if (e && (e.shiftKey || e.ctrlKey || e.metaKey)) {
      setFilterVoters(vs => vs.includes(v) ? vs.filter(x => x !== v) : [...vs, v]);
    } else {
      setFilterVoters(vs => (vs.length === 1 && vs[0] === v) ? [] : [v]);
    }
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
    if (mobileDrawerOpen) {
      document.body.style.overflow = 'hidden';
      const handleKeyDown = (e) => {
        if (e.key === 'Escape') setMobileDrawerOpen(false);
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        document.body.style.overflow = '';
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [mobileDrawerOpen]);

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
    <div className="films-page">
      {/* ── Top Bar: Search, Sort, Views, Add Film ── */}
      <div className="films-top-bar">
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

        <div className="films-sort-wrap">
          <select
            className="select select-sm films-sort-select"
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            title="Sort films"
          >
            <option value="alpha">Sort: A → Z</option>
            <option value="alpha-dir">Sort: By Director</option>
            <option value="year-desc">Sort: Newest</option>
            <option value="year-asc">Sort: Oldest</option>
            <option value="score-desc">Sort: Fair Score ↓</option>
            <option value="score-asc">Sort: Fair Score ↑</option>
            <option value="group-desc">Sort: Group Score ↓</option>
            <option value="group-asc">Sort: Group Score ↑</option>
            <option value="voter-desc">Sort: Voter Rating ↓</option>
            <option value="voter-asc">Sort: Voter Rating ↑</option>
            <option value="controversial">Sort: Most Controversial</option>
            <option value="added-desc">Sort: Recently Added</option>
            <option value="added-asc">Sort: First Added</option>
          </select>

          {(sortBy === 'voter-desc' || sortBy === 'voter-asc') && (
            <select
              className="select select-sm voter-sort-select"
              value={sortVoter}
              onChange={e => setSortVoter(e.target.value)}
              title="Select voter to sort by"
            >
              {voters.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          )}
        </div>

        <div className="view-toggle">
          <button
            className={`view-btn${scoreMode === 'fair' ? ' active' : ''}`}
            onClick={() => setScoreMode('fair')}
            title="Fair: per-voter average + Top 10 token bonus"
          >
            Fair
          </button>
          <button
            className={`view-btn${scoreMode === 'group' ? ' active' : ''}`}
            onClick={() => setScoreMode('group')}
            title="Group: sum ÷ 5 + Top 10 token bonus"
          >
            Group
          </button>
        </div>

        <div className="view-toggle">
          <button
            className={`view-btn${viewMode === 'list' ? ' active' : ''}`}
            onClick={() => setViewMode('list')}
            title="List view"
          >
            ☰
          </button>
          <button
            className={`view-btn${viewMode === 'grid' ? ' active' : ''}`}
            onClick={() => setViewMode('grid')}
            title="Grid view"
          >
            ⊞
          </button>
        </div>

        <button
          type="button"
          className={`btn btn-sm btn-ghost mobile-filters-btn${activeFilterCount > 0 ? ' active' : ''}`}
          onClick={() => setMobileDrawerOpen(true)}
          title="Open filters"
        >
          <span>⚙️ Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}</span>
        </button>

        <button className="btn btn-primary btn-add-film" onClick={() => setShowAdd(true)}>
          + Add Film
        </button>
      </div>

      {/* ── Active Filters Ribbon (Mobile & Compact Summary) ── */}
      {activeFilterCount > 0 && (
        <div className="films-mobile-active-strip">
          {filterMn && (
            <span className="active-chip">
              🎬 MN
              <button type="button" onClick={() => setFilterMn(false)} title="Remove Movie Night filter">✕</button>
            </span>
          )}
          {filterWl && (
            <span className="active-chip">
              👁 WL
              <button type="button" onClick={() => setFilterWl(false)} title="Remove Watchlist filter">✕</button>
            </span>
          )}
          {filterVoters.length > 0 && (
            <span className={`active-chip${filterRated === 'unvoted' ? ' active-chip-unvoted' : ''}`}>
              👤 {filterRated === 'unvoted' ? 'Unvoted: ' : 'Voted: '}{filterVoters.join(', ')}
              <button type="button" onClick={() => { setFilterVoters([]); setFilterRated(''); }} title="Remove voter filter">✕</button>
            </span>
          )}
          {filterVoters.length === 0 && filterRated && (
            <span className={`active-chip${filterRated === 'unvoted' ? ' active-chip-unvoted' : ''}`}>
              {filterRated === 'unvoted' ? 'Unrated (0)' : 'Rated (≥1)'}
              <button type="button" onClick={() => setFilterRated('')} title="Remove status filter">✕</button>
            </span>
          )}
          {filterDirector && (
            <span className="active-chip">
              🎭 {filterDirector}
              <button type="button" onClick={() => setFilterDirector('')} title="Remove director filter">✕</button>
            </span>
          )}
          {(filterYearMin || filterYearMax) && (
            <span className="active-chip">
              📅 {filterYearMin || '…'}–{filterYearMax || '…'}
              <button type="button" onClick={() => { setFilterYearMin(''); setFilterYearMax(''); }} title="Remove year filter">✕</button>
            </span>
          )}
          {(filterMinVoters || filterMaxVoters) && (
            <span className="active-chip">
              🗳 {filterMinVoters ? `≥${filterMinVoters}` : ''}{filterMinVoters && filterMaxVoters ? ' & ' : ''}{filterMaxVoters ? `≤${filterMaxVoters}` : ''} votes
              <button type="button" onClick={() => { setFilterMinVoters(''); setFilterMaxVoters(''); }} title="Remove vote count filter">✕</button>
            </span>
          )}
          <button type="button" className="active-chip-clear" onClick={resetFilters}>
            Clear all
          </button>
        </div>
      )}

      {/* ── Filter Toolbar ── */}
      <div className="films-filter-bar">
        {/* Scope toggles: Movie Night & Watchlist */}
        <div className="filter-scope-group">
          <button
            type="button"
            className={`filter-chip filter-chip-mn${filterMn ? ' active' : ''}`}
            onClick={() => setFilterMn(m => !m)}
          >
            <span className="chip-icon">🎬</span> Movie Night
          </button>

          <button
            type="button"
            className={`filter-chip filter-chip-wl${filterWl ? ' active' : ''}`}
            onClick={() => setFilterWl(w => !w)}
          >
            <span className="chip-icon">👁</span> Watchlist
          </button>
        </div>

        <div className="filter-bar-sep" />

        {/* Unified Voter & Rating Status Cluster */}
        <div className="filter-voter-cluster">
          <span className="voter-cluster-label">Voter:</span>
          <div className="filter-voter-pills">
            <button
              type="button"
              className={`voter-pill${filterVoters.length === 0 ? ' active' : ''}`}
              onClick={() => setFilterVoters([])}
              title="All voters (clear voter filter)"
            >
              All
            </button>
            {voters.map(v => (
              <button
                key={v}
                type="button"
                className={`voter-pill${filterVoters.includes(v) ? ' active' : ''}`}
                onClick={e => toggleVoter(v, e)}
                title={`Filter films by ${v} (click to select, Shift-click to multi-select)`}
              >
                {v}
              </button>
            ))}
          </div>

          <div className="filter-status-seg">
            {filterVoters.length === 0 ? (
              <>
                <button
                  type="button"
                  className={`status-seg-btn${filterRated === '' ? ' active' : ''}`}
                  onClick={() => setFilterRated('')}
                  title="Show all films regardless of votes"
                >
                  All
                </button>
                <button
                  type="button"
                  className={`status-seg-btn${filterRated === 'voted' ? ' active' : ''}`}
                  onClick={() => setFilterRated('voted')}
                  title="Show films with at least 1 vote from anyone"
                >
                  Voted
                </button>
                <button
                  type="button"
                  className={`status-seg-btn status-seg-unvoted${filterRated === 'unvoted' ? ' active' : ''}`}
                  onClick={() => setFilterRated('unvoted')}
                  title="Show films with 0 votes across the whole group"
                >
                  Unvoted
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className={`status-seg-btn${filterRated !== 'unvoted' ? ' active' : ''}`}
                  onClick={() => setFilterRated('voted')}
                  title={`Show films voted by ${filterVoters.join(', ')}`}
                >
                  Voted by {filterVoters.length === 1 ? filterVoters[0] : `${filterVoters.length} voters`}
                </button>
                <button
                  type="button"
                  className={`status-seg-btn status-seg-unvoted${filterRated === 'unvoted' ? ' active' : ''}`}
                  onClick={() => setFilterRated('unvoted')}
                  title={`Show films NOT voted by ${filterVoters.join(', ')}`}
                >
                  Unvoted by {filterVoters.length === 1 ? filterVoters[0] : `${filterVoters.length} voters`}
                </button>
              </>
            )}
          </div>
        </div>

        <div className="filter-bar-sep" />

        {/* More Filters Toggle */}
        <button
          type="button"
          className={`btn btn-sm btn-ghost filter-more-toggle${moreFiltersOpen || advancedFilterCount > 0 ? ' active' : ''}`}
          onClick={() => setMoreFiltersOpen(o => !o)}
          title="Toggle advanced filters (Director, Year, Voter count)"
        >
          <span>Filters{advancedFilterCount > 0 ? ` (${advancedFilterCount})` : ''}</span>
          <span className="filter-toggle-caret">{moreFiltersOpen ? '▲' : '▼'}</span>
        </button>

        {/* Reset & Count */}
        <div className="films-filter-actions">
          {filtersActive && (
            <button
              type="button"
              className="btn btn-sm btn-ghost filter-reset-active"
              onClick={resetFilters}
              title="Reset all active filters"
            >
              Reset ✕
            </button>
          )}
          <span className="filter-count-badge">
            {searchFiltered.length} / {movies.length}
          </span>
        </div>
      </div>

      {/* ── Advanced Filters Collapsible Drawer ── */}
      {moreFiltersOpen && (
        <div className="films-advanced-drawer">
          <div className="advanced-filter-item">
            <label className="advanced-label" htmlFor="filter-director">Director</label>
            <select
              id="filter-director"
              className="select select-sm advanced-select"
              value={filterDirector}
              onChange={e => setFilterDirector(e.target.value)}
            >
              <option value="">All Directors ({directors.length})</option>
              {directors.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          <div className="advanced-filter-item">
            <span className="advanced-label">Release Year</span>
            <div className="advanced-range-inputs">
              <input
                className="input input-sm advanced-input"
                placeholder="From"
                value={filterYearMin}
                onChange={e => setFilterYearMin(e.target.value)}
              />
              <span className="range-dash">–</span>
              <input
                className="input input-sm advanced-input"
                placeholder="To"
                value={filterYearMax}
                onChange={e => setFilterYearMax(e.target.value)}
              />
            </div>
          </div>

          <div className="advanced-filter-item">
            <span className="advanced-label">Votes Count</span>
            <div className="advanced-range-inputs">
              <select
                className="select select-sm advanced-select-range"
                value={filterMinVoters}
                onChange={e => setFilterMinVoters(e.target.value)}
              >
                <option value="">Min</option>
                <option value="1">≥ 1</option>
                <option value="2">≥ 2</option>
                <option value="3">≥ 3</option>
                <option value="4">≥ 4</option>
                <option value="5">≥ 5</option>
              </select>
              <span className="range-dash">–</span>
              <select
                className="select select-sm advanced-select-range"
                value={filterMaxVoters}
                onChange={e => setFilterMaxVoters(e.target.value)}
              >
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

          {advancedFilterCount > 0 && (
            <button
              type="button"
              className="btn btn-sm btn-ghost advanced-clear-btn"
              onClick={() => {
                setFilterDirector('');
                setFilterYearMin('');
                setFilterYearMax('');
                setFilterMinVoters('');
                setFilterMaxVoters('');
              }}
              title="Clear advanced filters"
            >
              Clear advanced
            </button>
          )}
        </div>
      )}

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

      {/* ── Mobile Filter Drawer ── */}
      {mobileDrawerOpen && (
        <div className="mobile-drawer-overlay" onClick={() => setMobileDrawerOpen(false)}>
          <div className="mobile-drawer-content" onClick={e => e.stopPropagation()}>
            <div className="mobile-drawer-header">
              <div className="mobile-drawer-title-wrap">
                <h2 className="mobile-drawer-title">Filters</h2>
                <span className="mobile-drawer-count">{searchFiltered.length} / {movies.length} films</span>
              </div>
              <div className="mobile-drawer-header-actions">
                {filtersActive && (
                  <button type="button" className="btn btn-sm btn-ghost mobile-drawer-reset" onClick={resetFilters}>
                    Reset
                  </button>
                )}
                <button
                  type="button"
                  className="mobile-drawer-close"
                  onClick={() => setMobileDrawerOpen(false)}
                  aria-label="Close filters"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="mobile-drawer-body">
              {/* Scope section */}
              <div className="mobile-drawer-section">
                <span className="mobile-section-label">Catalog Scope</span>
                <div className="filter-scope-group">
                  <button
                    type="button"
                    className={`filter-chip filter-chip-mn${filterMn ? ' active' : ''}`}
                    onClick={() => setFilterMn(m => !m)}
                  >
                    <span className="chip-icon">🎬</span> Movie Night
                  </button>
                  <button
                    type="button"
                    className={`filter-chip filter-chip-wl${filterWl ? ' active' : ''}`}
                    onClick={() => setFilterWl(w => !w)}
                  >
                    <span className="chip-icon">👁</span> Watchlist
                  </button>
                </div>
              </div>

              {/* Voter & Status Cluster */}
              <div className="mobile-drawer-section">
                <span className="mobile-section-label">Voter & Rating Status</span>
                <div className="filter-voter-cluster mobile-cluster">
                  <div className="filter-voter-pills">
                    <button
                      type="button"
                      className={`voter-pill${filterVoters.length === 0 ? ' active' : ''}`}
                      onClick={() => setFilterVoters([])}
                    >
                      All
                    </button>
                    {voters.map(v => (
                      <button
                        key={v}
                        type="button"
                        className={`voter-pill${filterVoters.includes(v) ? ' active' : ''}`}
                        onClick={e => toggleVoter(v, e)}
                      >
                        {v}
                      </button>
                    ))}
                  </div>

                  <div className="filter-status-seg mobile-seg">
                    {filterVoters.length === 0 ? (
                      <>
                        <button
                          type="button"
                          className={`status-seg-btn${filterRated === '' ? ' active' : ''}`}
                          onClick={() => setFilterRated('')}
                        >
                          All
                        </button>
                        <button
                          type="button"
                          className={`status-seg-btn${filterRated === 'voted' ? ' active' : ''}`}
                          onClick={() => setFilterRated('voted')}
                        >
                          Voted
                        </button>
                        <button
                          type="button"
                          className={`status-seg-btn status-seg-unvoted${filterRated === 'unvoted' ? ' active' : ''}`}
                          onClick={() => setFilterRated('unvoted')}
                        >
                          Unvoted
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className={`status-seg-btn${filterRated !== 'unvoted' ? ' active' : ''}`}
                          onClick={() => setFilterRated('voted')}
                        >
                          Voted by {filterVoters.length === 1 ? filterVoters[0] : `${filterVoters.length} voters`}
                        </button>
                        <button
                          type="button"
                          className={`status-seg-btn status-seg-unvoted${filterRated === 'unvoted' ? ' active' : ''}`}
                          onClick={() => setFilterRated('unvoted')}
                        >
                          Unvoted by {filterVoters.length === 1 ? filterVoters[0] : `${filterVoters.length} voters`}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Director section */}
              <div className="mobile-drawer-section">
                <label className="mobile-section-label" htmlFor="mobile-filter-director">Director</label>
                <select
                  id="mobile-filter-director"
                  className="select select-sm"
                  style={{ width: '100%' }}
                  value={filterDirector}
                  onChange={e => setFilterDirector(e.target.value)}
                >
                  <option value="">All Directors ({directors.length})</option>
                  {directors.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

              {/* Release Year */}
              <div className="mobile-drawer-section">
                <span className="mobile-section-label">Release Year</span>
                <div className="advanced-range-inputs">
                  <input
                    className="input input-sm advanced-input"
                    placeholder="From"
                    value={filterYearMin}
                    onChange={e => setFilterYearMin(e.target.value)}
                  />
                  <span className="range-dash">–</span>
                  <input
                    className="input input-sm advanced-input"
                    placeholder="To"
                    value={filterYearMax}
                    onChange={e => setFilterYearMax(e.target.value)}
                  />
                </div>
              </div>

              {/* Votes Count */}
              <div className="mobile-drawer-section">
                <span className="mobile-section-label">Votes Count</span>
                <div className="advanced-range-inputs">
                  <select
                    className="select select-sm advanced-select-range"
                    value={filterMinVoters}
                    onChange={e => setFilterMinVoters(e.target.value)}
                  >
                    <option value="">Min</option>
                    <option value="1">≥ 1</option>
                    <option value="2">≥ 2</option>
                    <option value="3">≥ 3</option>
                    <option value="4">≥ 4</option>
                    <option value="5">≥ 5</option>
                  </select>
                  <span className="range-dash">–</span>
                  <select
                    className="select select-sm advanced-select-range"
                    value={filterMaxVoters}
                    onChange={e => setFilterMaxVoters(e.target.value)}
                  >
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
            </div>

            <div className="mobile-drawer-footer">
              <button
                type="button"
                className="btn btn-primary mobile-drawer-apply"
                onClick={() => setMobileDrawerOpen(false)}
              >
                Show {searchFiltered.length} Films
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast />
    </div>
  );
}
