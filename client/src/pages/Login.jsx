import { useState } from 'react';
import { api } from '../api';

export default function Login({ onLogin }) {
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await api.login('mnAdmin', password);
      onLogin();
    } catch {
      setError('Wrong password.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <form onSubmit={handleSubmit} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '32px 28px', width: '100%', maxWidth: 340 }}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>🎬 Movie Night</div>
        <div style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 24 }}>Sign in to continue</div>
        {error && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>{error}</div>}
        <input
          className="input"
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          autoFocus
          style={{ marginBottom: 14 }}
        />
        <button className="btn btn-gold" style={{ width: '100%' }} disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
