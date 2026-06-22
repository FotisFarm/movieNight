import { useState } from 'react';
import { api } from '../api';

const VOTERS = ['Μητσέας', 'Παντελής', 'Στέλιας', 'Φώτης', 'Λεόντιος'];

export default function Login({ onLogin }) {
  const [selected, setSelected] = useState(null);
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const d = await api.login(selected, password);
      onLogin(d.voter);
    } catch {
      setError('Wrong password.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '32px 28px', width: '100%', maxWidth: 360 }}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>🎬 Movie Night</div>
        <div style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 24 }}>
          {selected ? 'Enter the password' : 'Who are you?'}
        </div>

        {!selected ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {VOTERS.map(v => (
                <button
                  key={v}
                  className="btn btn-ghost"
                  style={{ justifyContent: 'center', padding: '10px', fontSize: 14, fontWeight: 600 }}
                  onClick={() => setSelected(v)}
                >
                  {v}
                </button>
              ))}
            </div>
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
              <button
                className="btn btn-ghost"
                style={{ width: '100%', justifyContent: 'center', fontSize: 12, color: 'var(--text3)' }}
                onClick={() => setSelected('mnAdmin')}
              >
                Admin
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--green)' }}>{selected}</span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => { setSelected(null); setError(''); setPassword(''); }}
              >
                ← Back
              </button>
            </div>
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
        )}
      </div>
    </div>
  );
}
