import { useState, useEffect, useRef } from 'react';
import {
  DndContext, closestCenter, PointerSensor, TouchSensor,
  useSensor, useSensors, DragOverlay,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy,
  useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { api } from '../api';
import MovieModal from '../components/MovieModal';
import { useToast } from '../hooks/useToast.jsx';
import './Watchlist.css';

const VOTERS = ['Μητσέας', 'Παντελής', 'Στέλιας', 'Φώτης', 'Λεόντιος'];

function fmt(v) {
  if (v == null) return null;
  return v.toFixed(2).replace('.', ',') + '/10';
}

function loadManualOrder() {
  try { return JSON.parse(localStorage.getItem('wl-tied-order') || '{}'); } catch { return {}; }
}

function saveManualOrder(obj) {
  localStorage.setItem('wl-tied-order', JSON.stringify(obj));
}

function sortWithManual(a, b, manualOrder) {
  const vDiff = (b.watchlistVotes?.length ?? 0) - (a.watchlistVotes?.length ?? 0);
  if (vDiff !== 0) return vDiff;
  const vc = a.watchlistVotes?.length ?? 0;
  const order = manualOrder[vc] ?? [];
  const posA = order.indexOf(a.id), posB = order.indexOf(b.id);
  if (posA !== -1 && posB !== -1) return posA - posB;
  return (b.voterCount ?? 0) - (a.voterCount ?? 0);
}

function RankingRow({ m, index, draggable, onOpen }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: m.id, disabled: !draggable });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`wl-ranking-row${draggable ? ' wl-ranking-draggable' : ''}`}
      onClick={() => !isDragging && onOpen(m.id)}
    >
      {draggable && (
        <span className="wl-drag-handle" {...attributes} {...listeners} onClick={e => e.stopPropagation()}>
          ⠿
        </span>
      )}
      <span className="wl-ranking-pos">{index + 1}</span>
      <div className="wl-ranking-info">
        <span className="wl-ranking-name">{m.title}</span>
        <span className="wl-ranking-meta">{m.director} · {m.year || '?'}</span>
      </div>
      <div className="wl-ranking-voters">
        {VOTERS.map(v => m.watchlistVotes.includes(v) && (
          <span key={v} className="wl-vote-pill">{v}</span>
        ))}
      </div>
    </li>
  );
}

export default function Watchlist({ voter }) {
  const isAdmin = voter === 'mnAdmin';
  const [movies, setMovies]         = useState([]);
  const [loading, setLoading]       = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [manualOrder, setManualOrder] = useState(loadManualOrder);
  const [activeId, setActiveId]     = useState(null);
  const { toast, Toast }            = useToast();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 150, tolerance: 5 } }),
  );

  const sortedMovies = movies.slice().sort((a, b) => sortWithManual(a, b, manualOrder));

  useEffect(() => {
    api.getMovies({ watchlist: '1' })
      .then(ms => setMovies(ms))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Prune stale manual order groups when vote counts change
  useEffect(() => {
    const ranked = sortedMovies.filter(m => (m.watchlistVotes?.length ?? 0) > 0);
    const activeCounts = new Set(ranked.map(m => m.watchlistVotes.length));
    const pruned = Object.fromEntries(
      Object.entries(manualOrder).filter(([vc]) => activeCounts.has(Number(vc)))
    );
    if (Object.keys(pruned).length !== Object.keys(manualOrder).length) {
      saveManualOrder(pruned);
      setManualOrder(pruned);
    }
  }, [movies]);

  function handleDragEnd({ active, over }) {
    setActiveId(null);
    if (!over || active.id === over.id) return;
    const ranked = sortedMovies.filter(m => (m.watchlistVotes?.length ?? 0) > 0);
    const draggedM = ranked.find(m => m.id === active.id);
    const overM    = ranked.find(m => m.id === over.id);
    if (!draggedM || !overM) return;
    const vc = draggedM.watchlistVotes.length;
    if (overM.watchlistVotes.length !== vc) return;

    const group = ranked.filter(m => m.watchlistVotes.length === vc).map(m => m.id);
    const currentOrder = manualOrder[vc] ?? group;
    const fromIdx = currentOrder.indexOf(active.id);
    const toIdx   = currentOrder.indexOf(over.id);
    if (fromIdx === -1 || toIdx === -1) return;
    const next = arrayMove(currentOrder, fromIdx, toIdx);
    const updated = { ...manualOrder, [vc]: next };
    saveManualOrder(updated);
    setManualOrder(updated);
  }

  async function toggleVote(movie, targetVoter = voter) {
    const hasVoted = movie.watchlistVotes?.includes(targetVoter);
    if (!hasVoted && !isAdmin) {
      const myVoteCount = sortedMovies.filter(m => m.watchlistVotes?.includes(targetVoter)).length;
      if (myVoteCount >= 3) return;
    }
    setMovies(ms => ms.map(m => {
      if (m.id !== movie.id) return m;
      const votes = hasVoted
        ? m.watchlistVotes.filter(v => v !== targetVoter)
        : [...(m.watchlistVotes ?? []), targetVoter];
      return { ...m, watchlistVotes: votes };
    }));
    await api.toggleWatchlistVote(movie.id, isAdmin ? targetVoter : undefined);
  }

  async function toggleCinobo(movie) {
    const updated = await api.updateMovie(movie.id, { cinobo: movie.cinobo === 'Yes' ? 'No' : 'Yes' });
    setMovies(ms => ms.map(m => m.id === updated.id ? { ...updated, watchlistVotes: m.watchlistVotes } : m));
  }

  async function removeFromWatchlist(id) {
    await api.updateMovie(id, { watchlist: false });
    setMovies(ms => ms.filter(m => m.id !== id));
    toast('Removed from watchlist');
  }

  function handleSaved(updated) {
    if (!updated.watchlist) {
      setMovies(ms => ms.filter(m => m.id !== updated.id));
    } else {
      setMovies(ms => ms.map(m => m.id === updated.id ? { ...updated, watchlistVotes: m.watchlistVotes } : m));
    }
    toast('Saved!');
  }

  if (loading) return <div className="spinner" />;

  const myVoteCount = sortedMovies.filter(m => m.watchlistVotes?.includes(voter)).length;
  const ranked = sortedMovies.filter(m => (m.watchlistVotes?.length ?? 0) > 0);

  const voteCounts = ranked.map(m => m.watchlistVotes.length);
  const tiedCounts = new Set(voteCounts.filter((vc, _, arr) => arr.filter(x => x === vc).length > 1));
  const hasTies = tiedCounts.size > 0;

  const activeMovie = activeId ? ranked.find(m => m.id === activeId) : null;

  return (
    <div>
      <div className="wl-header">
        <h2 className="wl-title">Watchlist <span>{sortedMovies.length}</span></h2>
        {!isAdmin && (
          <p className="wl-desc">You have used <strong>{myVoteCount}</strong> of 3 votes.</p>
        )}
      </div>

      {ranked.length > 0 && (
        <div className="wl-ranking">
          <div className="wl-ranking-title">
            Most Wanted
            {isAdmin && hasTies && (
              <span className="wl-ranking-hint">· drag to break ties</span>
            )}
          </div>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={({ active }) => setActiveId(active.id)}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={ranked.map(m => m.id)} strategy={verticalListSortingStrategy}>
              <ol className="wl-ranking-list">
                {ranked.map((m, i) => (
                  <RankingRow
                    key={m.id}
                    m={m}
                    index={i}
                    draggable={isAdmin && tiedCounts.has(m.watchlistVotes.length)}
                    onOpen={setSelectedId}
                  />
                ))}
              </ol>
            </SortableContext>
            <DragOverlay>
              {activeMovie && (
                <div className="wl-ranking-row wl-ranking-overlay">
                  <span className="wl-drag-handle">⠿</span>
                  <span className="wl-ranking-name">{activeMovie.title}</span>
                </div>
              )}
            </DragOverlay>
          </DndContext>
        </div>
      )}

      {sortedMovies.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">👁</div>
          <div className="empty-title">Watchlist is empty</div>
          <div>Go to Films and click any card to add it</div>
        </div>
      ) : (
        <div className="wl-grid">
          {sortedMovies.map(m => {
            const hasVoted = m.watchlistVotes?.includes(voter);
            return (
              <div key={m.id} className="wl-card">
                <div className="wl-card-body" onClick={() => setSelectedId(m.id)}>
                  <div className="wl-card-top">
                    <div className="wl-movie-title">{m.title}</div>
                    {(m.watchlistVotes?.length ?? 0) > 0 && (
                      <span className="wl-vote-badge">{m.watchlistVotes.length}</span>
                    )}
                  </div>
                  <div className="wl-movie-meta">{m.director} · {m.year || '?'}</div>
                  {m.fairScore != null && (
                    <div className="wl-score">Fair avg: <strong>{fmt(m.fairScore)}</strong></div>
                  )}
                </div>

                {isAdmin && (
                  <div className="wl-admin-ribbon">
                    {VOTERS.map(v => {
                      const voted = m.watchlistVotes?.includes(v);
                      return (
                        <button
                          key={v}
                          className={`wl-admin-pill${voted ? ' wl-admin-pill-on' : ''}`}
                          onClick={() => toggleVote(m, v)}
                          title={voted ? `Remove ${v}'s vote` : `Add ${v}'s vote`}
                        >
                          {v}
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="wl-card-actions">
                  {!isAdmin && (
                    <button
                      className={`wl-vote-btn ${hasVoted ? 'wl-vote-on' : ''} ${!hasVoted && myVoteCount >= 3 ? 'wl-vote-disabled' : ''}`}
                      onClick={() => toggleVote(m)}
                    >
                      {hasVoted ? '★ Voted' : '☆ Vote'}
                    </button>
                  )}
                  <button
                    className={`cinobo-btn ${m.cinobo === 'Yes' ? 'cinobo-yes' : 'cinobo-no'}`}
                    onClick={() => toggleCinobo(m)}
                    title="Toggle Cinobo availability"
                  >
                    {m.cinobo === 'Yes' ? '✓ Cinobo' : '✗ Cinobo'}
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setSelectedId(m.id)}>Rate</button>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ color: 'var(--text3)' }}
                    onClick={() => removeFromWatchlist(m.id)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedId && (
        <MovieModal
          movieId={selectedId}
          onClose={() => setSelectedId(null)}
          onSaved={handleSaved}
          onDeleted={id => { setMovies(ms => ms.filter(m => m.id !== id)); setSelectedId(null); }}
        />
      )}
      <Toast />
    </div>
  );
}
