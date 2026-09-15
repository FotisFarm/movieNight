import { useState, useEffect, useRef } from 'react';
import { api } from '../api';
import './Login.css';

const SAVED_ACCOUNTS_KEY = 'mn_saved_accounts';

// Default starter accounts for the founding group so members can click their name immediately
const DEFAULT_STARTER_ACCOUNTS = [
  { username: 'Φώτης', displayName: 'Φώτης', isAdmin: true },
  { username: 'Μητσέας', displayName: 'Μητσέας', isAdmin: false },
  { username: 'Παντελής', displayName: 'Παντελής', isAdmin: false },
  { username: 'Στέλιας', displayName: 'Στέλιας', isAdmin: false },
  { username: 'Λεόντιος', displayName: 'Λεόντιος', isAdmin: false },
  { username: 'Κλαίρη', displayName: 'Κλαίρη', isAdmin: false },
];

const AVATAR_PALETTE = [
  '#4f46e5', '#059669', '#d97706', '#dc2626',
  '#7c3aed', '#0284c7', '#db2777', '#ca8a04',
];

function getAvatarColor(name) {
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

function loadSavedAccounts() {
  try {
    const raw = localStorage.getItem(SAVED_ACCOUNTS_KEY);
    if (!raw) return DEFAULT_STARTER_ACCOUNTS;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_STARTER_ACCOUNTS;
  } catch {
    return DEFAULT_STARTER_ACCOUNTS;
  }
}

function saveAccountToDevice(user) {
  if (!user || (!user.username && !user.displayName)) return;
  const username = user.username || user.displayName;
  const displayName = user.displayName || user.username;
  try {
    const raw = localStorage.getItem(SAVED_ACCOUNTS_KEY);
    let existing = [];
    try {
      existing = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(existing)) existing = [];
    } catch {
      existing = [];
    }

    const updated = [
      {
        username,
        displayName,
        isAdmin: Boolean(user.isAdmin),
        lastLogin: Date.now(),
      },
      ...existing.filter(a => a.username.toLowerCase() !== username.toLowerCase()),
    ].slice(0, 10); // Maintain up to 10 recent users on this device

    localStorage.setItem(SAVED_ACCOUNTS_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn('Failed to save account to device:', err);
  }
}

export default function Login({ onLogin }) {
  const [savedAccounts, setSavedAccounts] = useState(loadSavedAccounts);
  const [selectedAccount, setSelectedAccount] = useState(null); // account object
  const [view, setView] = useState('picker'); // 'picker' | 'password' | 'manual'

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword]     = useState('');
  const [error, setError]           = useState('');
  const [loading, setLoading]       = useState(false);

  const passwordInputRef = useRef(null);

  // Focus password input when entering password view
  useEffect(() => {
    if (view === 'password') {
      setTimeout(() => {
        passwordInputRef.current?.focus();
      }, 50);
    }
  }, [view, selectedAccount]);

  const handleSelectAccount = (account) => {
    setSelectedAccount(account);
    setPassword('');
    setError('');
    setView('password');
  };

  const handleRemoveAccount = (e, usernameToRemove) => {
    e.stopPropagation();
    const updated = savedAccounts.filter(
      a => a.username.toLowerCase() !== usernameToRemove.toLowerCase()
    );
    setSavedAccounts(updated);
    try {
      localStorage.setItem(SAVED_ACCOUNTS_KEY, JSON.stringify(updated));
    } catch {}
  };

  const handleSwitchAccount = () => {
    setSelectedAccount(null);
    setPassword('');
    setError('');
    setView('picker');
  };

  const handleOpenManual = () => {
    setIdentifier('');
    setPassword('');
    setError('');
    setView('manual');
  };

  async function handlePasswordSubmit(e) {
    e.preventDefault();
    if (!password) {
      setError('Please enter your password.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const username = selectedAccount.username || selectedAccount.displayName;
      const d = await api.login(username, password);
      saveAccountToDevice(d.user || { ...selectedAccount, username });
      onLogin(d);
    } catch (err) {
      setError(err.message || 'Incorrect password.');
    } finally {
      setLoading(false);
    }
  }

  async function handleManualSubmit(e) {
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
      saveAccountToDevice(d.user || { username: identifier.trim(), displayName: d.voter || identifier.trim() });
      onLogin(d);
    } catch (err) {
      setError(err.message || 'Invalid username or password.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-container">
      <div className="login-card">
        {/* Brand Header */}
        <div className="login-brand">
          <div className="login-brand-title">
            <span>🎬</span> Movie Night
          </div>
          <div className="login-brand-sub">
            {view === 'password'
              ? 'Enter your password to sign in'
              : view === 'manual'
              ? 'Sign in with your username or handle'
              : 'Choose your account to sign in'}
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="login-error">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {/* ── VIEW 1: PROFILE PICKER (Grid of remembered users) ── */}
        {view === 'picker' && (
          <div>
            <div className={`login-profiles-grid${savedAccounts.length > 4 ? ' grid-many' : ''}`}>
              {savedAccounts.map(account => {
                const name = account.displayName || account.username;
                const initials = name.slice(0, 2).toUpperCase();
                const avatarBg = getAvatarColor(name);

                return (
                  <div
                    key={account.username}
                    className="login-profile-card"
                    onClick={() => handleSelectAccount(account)}
                    title={`Sign in as ${name}`}
                  >
                    <button
                      type="button"
                      className="login-remove-btn"
                      onClick={(e) => handleRemoveAccount(e, account.username)}
                      title="Remove from this device"
                    >
                      ✕
                    </button>
                    <div className="login-profile-avatar" style={{ background: avatarBg }}>
                      {initials}
                    </div>
                    <div className="login-profile-name">{name}</div>
                    {account.username !== name && (
                      <div className="login-profile-handle">@{account.username}</div>
                    )}
                    {account.isAdmin && (
                      <div className="login-profile-badge">👑 Admin</div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="login-footer-actions">
              <button
                type="button"
                className="login-alt-btn"
                onClick={handleOpenManual}
              >
                <span>＋</span> Use another account
              </button>

              <button
                type="button"
                className="login-admin-quick-link"
                onClick={() => handleSelectAccount({ username: 'mnAdmin', displayName: 'Admin', isAdmin: true })}
              >
                Log in as System Administrator
              </button>
            </div>
          </div>
        )}

        {/* ── VIEW 2: PASSWORD ENTRY FOR SELECTED PROFILE ── */}
        {view === 'password' && selectedAccount && (
          <form onSubmit={handlePasswordSubmit}>
            <div className="login-selected-header">
              <div
                className="login-profile-avatar"
                style={{
                  width: 40,
                  height: 40,
                  marginBottom: 0,
                  background: getAvatarColor(selectedAccount.displayName || selectedAccount.username),
                }}
              >
                {(selectedAccount.displayName || selectedAccount.username).slice(0, 2).toUpperCase()}
              </div>
              <div className="login-selected-info">
                <div className="login-selected-name">
                  {selectedAccount.displayName || selectedAccount.username}
                  {selectedAccount.isAdmin && ' 👑'}
                </div>
                <div className="login-selected-handle">
                  @{selectedAccount.username}
                </div>
              </div>
              <button
                type="button"
                className="login-switch-btn"
                onClick={handleSwitchAccount}
              >
                Switch
              </button>
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>
                Password
              </label>
              <input
                ref={passwordInputRef}
                className="input"
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={e => { setPassword(e.target.value); setError(''); }}
                autoComplete="current-password"
                style={{ width: '100%', boxSizing: 'border-box' }}
              />
            </div>

            <button
              type="submit"
              className="btn btn-gold"
              style={{ width: '100%', justifyContent: 'center', padding: '10px 0', fontSize: 14, fontWeight: 700 }}
              disabled={loading}
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>

            <div style={{ marginTop: 16, textAlign: 'center' }}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={handleSwitchAccount}
                style={{ fontSize: 12, color: 'var(--text2)' }}
              >
                ← Back to accounts
              </button>
            </div>
          </form>
        )}

        {/* ── VIEW 3: MANUAL USERNAME + PASSWORD ENTRY ── */}
        {view === 'manual' && (
          <form onSubmit={handleManualSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>
                Username or Name
              </label>
              <input
                className="input"
                type="text"
                placeholder="Username or Name"
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

            {savedAccounts.length > 0 && (
              <div style={{ marginTop: 6, textAlign: 'center' }}>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setView('picker')}
                  style={{ fontSize: 12, color: 'var(--text2)' }}
                >
                  ← Back to remembered accounts
                </button>
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
