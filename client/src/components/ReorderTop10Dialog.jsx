import { useState, useEffect } from 'react';
import {
  DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { api } from '../api';
import { posterUrl } from '../utils';
import RankIcon from './RankIcon';

function ReorderSortableRow({ item, isCurrent, onRemove, disabled }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`reorder-row${isCurrent ? ' reorder-row-current' : ''}`}
    >
      <span
        className="reorder-handle"
        {...attributes}
        {...listeners}
        title="Drag to reorder"
      >
        ⠿
      </span>
      <span className="reorder-rank">
        <RankIcon rank={item.rank} />
      </span>
      <div className="reorder-thumb">
        {item.poster_path ? (
          <img
            src={posterUrl(item.poster_path, 'w92')}
            alt=""
            loading="lazy"
          />
        ) : (
          <div className="reorder-thumb-empty">🎞</div>
        )}
      </div>
      <div className="reorder-info">
        <div className="reorder-title-line">
          <span className="reorder-title">{item.title}</span>
          {isCurrent && (
            <span className="reorder-current-badge">Current film</span>
          )}
        </div>
        <div className="reorder-meta">
          {item.year ? item.year : ''}{item.director ? ` · ${item.director}` : ''}
        </div>
      </div>
      <button
        type="button"
        className="reorder-remove-btn"
        title={`Remove ${item.title} from Top 10`}
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
      >
        ✕
      </button>
    </div>
  );
}

export default function ReorderTop10Dialog({
  voter,
  currentMovieId,
  currentMovieTitle,
  currentMovieYear,
  currentMovieDirector,
  currentMoviePoster,
  onClose,
  onOrderUpdated,
}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    setLoading(true);
    setError('');
    api.getTop10(voter)
      .then(data => {
        setItems(data.map((d, i) => ({ ...d, rank: i + 1 })));
      })
      .catch(err => {
        setError(err.message || 'Failed to load Top 10');
      })
      .finally(() => setLoading(false));
  }, [voter]);

  const isInTop10 = items.some(it => it.id === currentMovieId);

  async function persistOrder(newItems) {
    setSaving(true);
    setError('');
    try {
      const ids = newItems.map(it => it.id);
      await api.reorderTop10(ids, voter);
      onOrderUpdated(newItems);
    } catch (err) {
      setError(err.message || 'Failed to save Top 10');
    } finally {
      setSaving(false);
    }
  }

  function handleDragEnd({ active, over }) {
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex(it => it.id === active.id);
    const newIndex = items.findIndex(it => it.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(items, oldIndex, newIndex).map((it, idx) => ({
      ...it,
      rank: idx + 1,
    }));
    setItems(reordered);
    persistOrder(reordered);
  }

  function handleAddCurrentFilm() {
    if (saving || isInTop10) return;
    const newItem = {
      id: currentMovieId,
      title: currentMovieTitle,
      year: currentMovieYear,
      director: currentMovieDirector,
      poster_path: currentMoviePoster,
      rank: items.length + 1,
    };
    const newItems = [...items, newItem]
      .slice(0, 10)
      .map((it, idx) => ({ ...it, rank: idx + 1 }));
    setItems(newItems);
    persistOrder(newItems);
  }

  function handleRemoveFilm(idToRemove) {
    if (saving) return;
    const newItems = items
      .filter(it => it.id !== idToRemove)
      .map((it, idx) => ({ ...it, rank: idx + 1 }));
    setItems(newItems);
    persistOrder(newItems);
  }

  return (
    <div className="reorder-dialog-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="reorder-dialog">
        <div className="reorder-dialog-header">
          <div className="reorder-dialog-header-text">
            <h3 className="reorder-dialog-title">{voter}&rsquo;s Top 10</h3>
            <div className="reorder-dialog-sub">
              {items.length} of 10 picks · Drag handle ⠿ to reorder
            </div>
          </div>
          <button type="button" className="modal-close" onClick={onClose} title="Close">✕</button>
        </div>

        {error && <div className="reorder-error-banner">{error}</div>}

        <div className="reorder-dialog-body">
          {loading ? (
            <div className="reorder-loading"><div className="spinner" /></div>
          ) : (
            <>
              {!isInTop10 && (
                <div className="reorder-add-banner">
                  <div className="reorder-add-desc">
                    &ldquo;{currentMovieTitle}&rdquo; is not yet in this Top 10.
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm reorder-add-btn"
                    onClick={handleAddCurrentFilm}
                    disabled={saving}
                  >
                    ＋ Add to Top 10 {items.length >= 10 ? '(bumps #10)' : ''}
                  </button>
                </div>
              )}

              {items.length === 0 ? (
                <div className="reorder-empty">No films in Top 10 yet.</div>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext items={items.map(it => it.id)} strategy={verticalListSortingStrategy}>
                    <div className="reorder-list">
                      {items.map(item => (
                        <ReorderSortableRow
                          key={item.id}
                          item={item}
                          isCurrent={item.id === currentMovieId}
                          onRemove={() => handleRemoveFilm(item.id)}
                          disabled={saving}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </>
          )}
        </div>

        <div className="reorder-dialog-footer">
          <span className="reorder-footer-hint">
            {saving ? 'Saving changes…' : 'Changes save automatically'}
          </span>
          <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
