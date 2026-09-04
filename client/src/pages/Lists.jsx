import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  DndContext, closestCenter, PointerSensor, TouchSensor,
  useSensor, useSensors,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy,
  useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { api } from '../api';
import MovieCard from '../components/MovieCard';
import MovieModal from '../components/MovieModal';
import { useToast } from '../hooks/useToast.jsx';
import { posterUrl } from '../utils';
import './Lists.css';

// ── Stacked poster preview on an index card ──
// Up to six posters sit side by side; past three they slide over each other so a
// long list still fits the card width instead of shrinking the artwork.
function PosterStack({ posters = [], filmCount = 0 }) {
  if (posters.length === 0) return null;
  const hidden = filmCount - posters.length;
  return (
    <div className={`lists-card-posters${posters.length > 3 ? ' overlap' : ''}`}>
      {posters.map((path, index) => (
        <img
          key={`${path}-${index}`}
          className="lists-card-poster"
          style={{ zIndex: posters.length - index }}
          src={posterUrl(path, 'w92')}
          alt=""
          loading="lazy"
          decoding="async"
        />
      ))}
      {hidden > 0 && <span className="lists-card-poster-more">+{hidden}</span>}
    </div>
  );
}

// ── One draggable film row inside a list ──
function ListFilmRow({ movie, editable, onOpen, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: movie.id, disabled: !editable });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="list-film-row">
      {editable && (
        <span className="list-drag-handle" {...attributes} {...listeners} title="Drag to reorder">⠿</span>
      )}
      <div className="list-film-card">
        <MovieCard movie={movie} listView scoreMode="fair" onClick={() => onOpen(movie.id)} />
      </div>
      <button
        className="list-remove-btn"
        title="Remove from list"
        onClick={() => onRemove(movie)}
      >
        ✕
      </button>
    </div>
  );
}

// ── Search-and-add box ──
function AddFilmBox({ existingIds, onAdd }) {
  const [query, setQuery]     = useState('');
  const [results, setResults] = useState([]);
  const [busy, setBusy]       = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); return; }
    const mine = ++seq.current;
    setBusy(true);
    const t = setTimeout(() => {
      api.getMovies({ search: q })
        .then(ms => { if (seq.current === mine) setResults(ms.slice(0, 20)); })
        .catch(console.error)
        .finally(() => { if (seq.current === mine) setBusy(false); });
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <div className="list-add-box">
      <input
        className="input list-add-input"
        placeholder="Search films to add…"
        value={query}
        onChange={e => setQuery(e.target.value)}
      />
      {query.trim().length >= 2 && (
        <div className="list-add-results">
          {busy && results.length === 0 && <div className="list-add-empty">Searching…</div>}
          {!busy && results.length === 0 && <div className="list-add-empty">No films match “{query.trim()}”</div>}
          {results.map(m => {
            const already = existingIds.has(m.id);
            return (
              <button
                key={m.id}
                className="list-add-result"
                disabled={already}
                onClick={() => { onAdd(m); setQuery(''); }}
              >
                <span className="list-add-title">{m.title}</span>
                <span className="list-add-meta">{m.director}{m.year ? ` · ${m.year}` : ''}</span>
                <span className="list-add-action">{already ? 'on list' : '+ add'}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── List detail (/lists/:key) ──
// `listKey` is whatever is in the URL: the list's slug, a slug it had before a
// rename, or a bare id from a link predating slugs. All three resolve
// server-side; the last two get corrected in the address bar once the list
// lands. Writes address the list by numeric id, which never changes.
function ListDetail({ listKey, voter }) {
  const navigate = useNavigate();
  const [list, setList]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftDesc, setDraftDesc]   = useState('');
  const [modalId, setModalId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { toast, Toast } = useToast();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 150, tolerance: 5 } }),
  );

  useEffect(() => {
    setLoading(true);
    api.getList(listKey)
      .then(l => {
        setList(l); setDraftTitle(l.title); setDraftDesc(l.description || '');
        // Arrived via an old slug or a numeric id — swap the URL for the
        // canonical one without adding a history entry.
        if (l.slug && l.slug !== listKey) navigate(`/lists/${l.slug}`, { replace: true });
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [listKey]);

  if (loading) return <div className="spinner" />;
  if (error || !list) return <div className="lists-empty">{error || "List not found"}</div>;

  const canEdit = voter === 'mnAdmin' || voter === list.created_by;
  const films = list.films || [];
  const existingIds = new Set(films.map(f => f.id));

  async function addFilm(movie) {
    if (existingIds.has(movie.id)) return;
    try {
      await api.addToList(list.id, movie.id);
      const fresh = await api.getList(list.id);
      setList(fresh);
      toast(`Added “${movie.title}”`);
    } catch (e) { toast(e.message); }
  }

  async function removeFilm(movie) {
    try {
      await api.removeFromList(list.id, movie.id);
      setList(l => ({ ...l, films: l.films.filter(f => f.id !== movie.id) }));
      toast(`Removed “${movie.title}”`);
    } catch (e) { toast(e.message); }
  }

  async function saveMeta() {
    const title = draftTitle.trim();
    if (!title) { toast('Title is required'); return; }
    try {
      const updated = await api.updateList(list.id, { title, description: draftDesc.trim() });
      setList(l => ({ ...l, ...updated }));
      // A rename re-slugs the list; follow it so the URL matches the new title.
      // The old slug keeps resolving server-side, so shared links survive.
      if (updated.slug && updated.slug !== list.slug) navigate(`/lists/${updated.slug}`, { replace: true });
      setEditing(false);
    } catch (e) { toast(e.message); }
  }

  async function removeList() {
    try {
      await api.deleteList(list.id);
      navigate('/lists');
    } catch (e) { toast(e.message); setConfirmDelete(false); }
  }

  // Persist the new order optimistically — the films array is the source of truth.
  async function handleDragEnd({ active, over }) {
    if (!over || active.id === over.id) return;
    const oldIndex = films.findIndex(f => f.id === active.id);
    const newIndex = films.findIndex(f => f.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(films, oldIndex, newIndex);
    setList(l => ({ ...l, films: reordered }));
    try {
      await api.reorderList(list.id, reordered.map(f => f.id));
    } catch (e) {
      toast(e.message);
      setList(l => ({ ...l, films }));
    }
  }

  return (
    <div className="lists-page">
      <div className="lists-detail-head">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/lists')}>← All lists</button>
        {canEdit && !editing && (
          <div className="lists-detail-actions">
            <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>✎ Edit</button>
            <button className="btn btn-ghost btn-sm lists-danger" onClick={() => setConfirmDelete(true)}>Delete list</button>
          </div>
        )}
      </div>

      {editing ? (
        <div className="lists-edit-form">
          <input
            className="input"
            value={draftTitle}
            maxLength={80}
            onChange={e => setDraftTitle(e.target.value)}
            placeholder="List title"
          />
          <input
            className="input"
            value={draftDesc}
            maxLength={300}
            onChange={e => setDraftDesc(e.target.value)}
            placeholder="Description (optional)"
          />
          <div className="lists-edit-buttons">
            <button className="btn btn-primary btn-sm" onClick={saveMeta}>Save</button>
            <button className="btn btn-ghost btn-sm" onClick={() => {
              setEditing(false); setDraftTitle(list.title); setDraftDesc(list.description || '');
            }}>Cancel</button>
          </div>
        </div>
      ) : (
        <>
          <h1 className="lists-title">{list.title}</h1>
          {list.description && <p className="lists-desc">{list.description}</p>}
        </>
      )}

      <div className="lists-detail-sub">
        {films.length} film{films.length !== 1 ? 's' : ''}
        {list.created_by ? ` · by ${list.created_by}` : ''}
        {canEdit && films.length > 1 ? ' · drag to reorder' : ''}
      </div>

      <AddFilmBox existingIds={existingIds} onAdd={addFilm} />

      {films.length === 0 ? (
        <div className="lists-empty">Nothing here yet — search above to add the first film.</div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={films.map(f => f.id)} strategy={verticalListSortingStrategy}>
            <div className="list-films">
              {films.map(f => (
                <ListFilmRow
                  key={f.id}
                  movie={f}
                  editable={canEdit}
                  onOpen={setModalId}
                  onRemove={removeFilm}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {confirmDelete && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setConfirmDelete(false)}>
          <div className="modal lists-confirm">
            <div className="modal-header">
              <div className="modal-header-text">
                <div className="modal-title">Delete “{list.title}”?</div>
                <div className="modal-sub">The list and its {films.length} entr{films.length === 1 ? 'y' : 'ies'} go away. The films themselves are untouched.</div>
              </div>
              <button className="modal-close" onClick={() => setConfirmDelete(false)}>✕</button>
            </div>
            <div className="lists-confirm-buttons">
              <button className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>Cancel</button>
              <button className="btn btn-danger" onClick={removeList}>Delete list</button>
            </div>
          </div>
        </div>
      )}

      {modalId && (
        <MovieModal
          movieId={modalId}
          // The modal can add/remove this film from any list, including this one,
          // so refetch on close rather than trusting the local copy.
          onClose={() => { setModalId(null); api.getList(list.id).then(setList).catch(() => {}); }}
          onSaved={saved => setList(l => ({
            ...l,
            films: l.films.map(f => (f.id === saved.id ? saved : f)),
          }))}
          onDeleted={did => setList(l => ({ ...l, films: l.films.filter(f => f.id !== did) }))}
        />
      )}

      <Toast />
    </div>
  );
}

// ── List index (/lists) ──
function ListIndex({ voter }) {
  const navigate = useNavigate();
  const [lists, setLists]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc]   = useState('');
  const { toast, Toast } = useToast();

  useEffect(() => {
    api.getLists()
      .then(setLists)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  async function create() {
    const title = newTitle.trim();
    if (!title) { toast('Give the list a title'); return; }
    try {
      const created = await api.createList({ title, description: newDesc.trim() });
      setNewTitle(''); setNewDesc(''); setCreating(false);
      navigate(`/lists/${created.slug}`);
    } catch (e) { toast(e.message); }
  }

  return (
    <div className="lists-page">
      <div className="lists-head">
        <h1 className="lists-title">Lists</h1>
        {!creating && (
          <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>+ New list</button>
        )}
      </div>

      {creating && (
        <div className="lists-edit-form">
          <input
            className="input"
            autoFocus
            value={newTitle}
            maxLength={80}
            placeholder="List title — e.g. “Christmas 2026”"
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && create()}
          />
          <input
            className="input"
            value={newDesc}
            maxLength={300}
            placeholder="Description (optional)"
            onChange={e => setNewDesc(e.target.value)}
          />
          <div className="lists-edit-buttons">
            <button className="btn btn-primary btn-sm" onClick={create}>Create</button>
            <button className="btn btn-ghost btn-sm" onClick={() => { setCreating(false); setNewTitle(''); setNewDesc(''); }}>Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="spinner" />
      ) : lists.length === 0 ? (
        <div className="lists-empty">No lists yet. Make one — any theme you like.</div>
      ) : (
        <div className="lists-grid">
          {lists.map(l => (
            <div key={l.id} className="lists-card" onClick={() => navigate(`/lists/${l.slug || l.id}`)}>
              <PosterStack posters={l.posters} filmCount={l.film_count} />
              <div className="lists-card-title">{l.title}</div>
              {l.description && <div className="lists-card-desc">{l.description}</div>}
              <div className="lists-card-foot">
                <span className="lists-card-count">{l.film_count} film{l.film_count !== 1 ? 's' : ''}</span>
                {l.created_by && <span className="lists-card-by">{l.created_by}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      <Toast />
    </div>
  );
}

export default function Lists({ voter }) {
  const { key } = useParams();
  // Remount on a different list rather than reusing the detail component's state.
  return key ? <ListDetail key={key} listKey={key} voter={voter} /> : <ListIndex voter={voter} />;
}
