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
  getDirectors: () => request('/movies/directors'),
  getRankings: () => request('/rankings'),
  getRecommendations: (weights = {}) => {
    const qs = new URLSearchParams(Object.fromEntries(Object.entries(weights).filter(([,v]) => v != null))).toString();
    return request(`/recommendations${qs ? `?${qs}` : ''}`);
  },
  toggleWatchlistVote: (id, targetVoter) => request(`/movies/${id}/watchlist-vote`, { method: 'POST', body: targetVoter ? { targetVoter } : undefined }),
  login: (voter, password) => request('/auth/login', { method: 'POST', body: { voter, password } }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  me: () => request('/auth/me'),
};
