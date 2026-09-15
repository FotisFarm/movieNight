import { useState } from 'react';
import { api } from '../api';
import { useAppConfig } from '../AppConfigContext';

export default function Login({ onLogin }) {
  const { voters = [] } = useAppConfig() || {};
  const [selected, setSelected] = useState(null);
  const [customUser, setCustomUser] = useState(false);
  const [customIdentifier, setCustomIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [logoClicks, setLogoClicks] = useState(0);
  const ghostVisible = logoClicks >= 5;

  async function handleSubmit(e) {
    e.preventDefault();
    const user = customUser ? customIdentifier.trim() : selected;
    if (!user) {
      setError('Please choose or enter your name.');
      return;
    }
    if (!password) {
      setError('Please enter your password.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const d = await api.login(user, password);
      onLogin(d);
    } catch {
      setError('Wrong password.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '32px 28px', width: '100%', maxWidth: 360 }}>
        <div
          style={{ fontSize: 22, fontWeight: 700, marginBottom: 6, cursor: 'default', userSelect: 'none' }}
          onClick={() => setLogoClicks(c => c + 1)}
        >
          🎬 Movie Night
        </div>
        <div style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 24 }}>
          {selected || customUser ? 'Enter the password' : 'Who are you?'}
        </div>

        {!selected && !customUser ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {voters.map(v => (
                <button
                  key={v}
                  type="button"
                  className="btn btn-ghost"
                  style={{ justifyContent: 'center', padding: '10px', fontSize: 14, fontWeight: 600 }}
                  onClick={() => { setSelected(v); setError(''); setPassword(''); }}
                >
                  {v}
                </button>
              ))}
            </div>
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ width: '100%', justifyContent: 'center', fontSize: 12, color: 'var(--text3)' }}
                onClick={() => { setSelected('mnAdmin'); setError(''); setPassword(''); }}
              >
                Admin
              </button>
              {ghostVisible && !voters.includes('Σάκιας') && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ width: '100%', justifyContent: 'center', fontSize: 12, color: 'var(--text3)', opacity: 0.6 }}
                  onClick={() => { setSelected('Σάκιας'); setError(''); setPassword(''); }}
                >
                  Σάκιας
                </button>
              )}
              <button
                type="button"
                className="btn btn-ghost"
                style={{ width: '100%', justifyContent: 'center', fontSize: 11, color: 'var(--text3)', opacity: 0.6 }}
                onClick={() => { setCustomUser(true); setError(''); setPassword(''); }}
              >
                Other account…
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--green)' }}>
                {customUser ? 'Other Account' : selected}
              </span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => { setSelected(null); setCustomUser(false); setError(''); setPassword(''); }}
              >
                ← Back
              </button>
            </div>
            {error && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>{error}</div>}

            {customUser && (
              <input
                className="input"
                type="text"
                placeholder="Username or Name"
                value={customIdentifier}
                onChange={e => { setCustomIdentifier(e.target.value); setError(''); }}
                autoFocus
                style={{ marginBottom: 12 }}
              />
            )}

            <input
              className="input"
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => { setPassword(e.target.value); setError(''); }}
              autoFocus={!customUser}
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
