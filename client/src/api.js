const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  getMovies: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== '' && v !== false))
    ).toString();
    return request(`/movies${qs ? `?${qs}` : ''}`);
  },
  getMovie: (id) => request(`/movies/${id}`),
  createMovie: (data) => request('/movies', { method: 'POST', body: data }),
  updateMovie: (id, data) => request(`/movies/${id}`, { method: 'PATCH', body: data }),
  deleteMovie: (id) => request(`/movies/${id}`, { method: 'DELETE' }),
  getMovieHistory: (id) => request(`/movies/${id}/history`),
  getDirectors: () => request('/movies/directors'),
  imdbSearch: (title, year) => request(`/movies/imdb-search?title=${encodeURIComponent(title)}&year=${encodeURIComponent(year || '')}`),
  imdbDetail: (imdbId) => request(`/movies/imdb-detail?imdbId=${encodeURIComponent(imdbId)}`),
  reorderTop10: (order, voter) => request('/movies/top10', { method: 'PUT', body: voter ? { order, voter } : { order } }),
  getTop10Counts: () => request('/movies/top10-counts'),
  getRankings: (params = {}) => {
    const qs = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v != null))).toString();
    return request(`/rankings${qs ? `?${qs}` : ''}`);
  },
  getRecommendations: (weights = {}) => {
    const qs = new URLSearchParams(Object.fromEntries(Object.entries(weights).filter(([,v]) => v != null))).toString();
    return request(`/recommendations${qs ? `?${qs}` : ''}`);
  },
  toggleWatchlistVote: (id, targetVoter) => request(`/movies/${id}/watchlist-vote`, { method: 'POST', body: targetVoter ? { targetVoter } : undefined }),
  resetWatchlist: (mode) => request('/movies/watchlist/reset', { method: 'POST', body: { mode } }),
  getLists: () => request('/lists'),
  getList: (id) => request(`/lists/${id}`),
  createList: (data) => request('/lists', { method: 'POST', body: data }),
  updateList: (id, data) => request(`/lists/${id}`, { method: 'PATCH', body: data }),
  deleteList: (id) => request(`/lists/${id}`, { method: 'DELETE' }),
  addToList: (id, movieId) => request(`/lists/${id}/items`, { method: 'POST', body: { movie_id: movieId } }),
  removeFromList: (id, movieId) => request(`/lists/${id}/items/${movieId}`, { method: 'DELETE' }),
  reorderList: (id, order) => request(`/lists/${id}/items`, { method: 'PUT', body: { order } }),
  askChat: (messages) => request('/chat', { method: 'POST', body: { messages } }),
  login: (voter, password) => request('/auth/login', { method: 'POST', body: { voter, password } }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  me: () => request('/auth/me'),
};
