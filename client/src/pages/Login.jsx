import { useState } from 'react';
import { api } from '../api';
import { useAppConfig } from '../AppConfigContext';

export default function Login({ onLogin }) {
  const { voters, allVoters } = useAppConfig();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword]     = useState('');
  const [error, setError]           = useState('');
  const [loading, setLoading]       = useState(false);
  const [showQuickPicks, setShowQuickPicks] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!identifier.trim()) {
      setError('Please enter your username or name.');
      return;
    }
    if (!password) {
      setError('Please enter your password.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const d = await api.login(identifier.trim(), password);
      onLogin(d);
    } catch (err) {
      setError(err.message || 'Invalid username or password.');
    } finally {
      setLoading(false);
    }
  }

  const quickVoters = (allVoters && allVoters.length > 0) ? allVoters : (voters || []);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: '36px 30px',
        width: '100%',
        maxWidth: 380,
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.5px', marginBottom: 6 }}>
            🎬 Movie Night
          </div>
          <div style={{ color: 'var(--text2)', fontSize: 13 }}>
            Sign in with your personal credentials
          </div>
        </div>

        {error && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid var(--red)',
            color: 'var(--red)',
            padding: '10px 12px',
            borderRadius: 'var(--radius)',
            fontSize: 13,
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>
              Username or Name
            </label>
            <input
              className="input"
              type="text"
              placeholder="e.g. Φώτης, mnAdmin..."
              value={identifier}
              onChange={e => { setIdentifier(e.target.value); setError(''); }}
              autoFocus
              autoCapitalize="none"
              autoComplete="username"
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>
              Password
            </label>
            <input
              className="input"
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => { setPassword(e.target.value); setError(''); }}
              autoComplete="current-password"
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
          </div>

          <button
            type="submit"
            className="btn btn-gold"
            style={{ width: '100%', justifyContent: 'center', marginTop: 6, padding: '10px 0', fontSize: 14, fontWeight: 700 }}
            disabled={loading}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        {/* Quick select assistant for existing voters */}
        <div style={{ marginTop: 24, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
              Quick Select
            </span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ fontSize: 11, padding: '2px 6px', height: 'auto', color: 'var(--text2)' }}
              onClick={() => setShowQuickPicks(s => !s)}
            >
              {showQuickPicks ? 'Hide ▲' : 'Show members ▼'}
            </button>
          </div>

          {showQuickPicks && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {quickVoters.map(v => (
                <button
                  key={v}
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{
                    fontSize: 12,
                    padding: '4px 8px',
                    borderColor: identifier === v ? 'var(--gold)' : undefined,
                    color: identifier === v ? 'var(--gold)' : undefined,
                  }}
                  onClick={() => { setIdentifier(v); setError(''); }}
                >
                  {v}
                </button>
              ))}
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ fontSize: 12, padding: '4px 8px', color: 'var(--text3)' }}
                onClick={() => { setIdentifier('mnAdmin'); setError(''); }}
              >
                Admin
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
