import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../api';
import './Admin.css';

export default function Admin() {
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);

  // Search & Filters
  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');

  // Modals state
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [resetTargetUser, setResetTargetUser] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Add User Form State
  const [newUsername, setNewUsername] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newGroupId, setNewGroupId] = useState('1');
  const [newPassword, setNewPassword] = useState('movieNight5');
  const [newIsAdmin, setNewIsAdmin] = useState(false);
  const [formError, setFormError] = useState('');

  const showNotification = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');
      const [uList, gList] = await Promise.all([
        api.adminGetUsers(),
        api.adminGetGroups().catch(() => []),
      ]);
      setUsers(Array.isArray(uList) ? uList : []);
      setGroups(Array.isArray(gList) ? gList : []);
      if (Array.isArray(gList) && gList.length > 0 && !newGroupId) {
        setNewGroupId(String(gList[0].id));
      }
    } catch (err) {
      console.error('Failed to load admin data:', err);
      setError(err.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredUsers = useMemo(() => {
    const q = search.toLowerCase().trim();
    return users.filter(u => {
      const matchSearch = !q
        || u.username.toLowerCase().includes(q)
        || u.displayName.toLowerCase().includes(q);
      const matchGroup = groupFilter === 'all'
        || u.groups?.some(g => String(g.id) === groupFilter);
      const matchRole = roleFilter === 'all'
        || (roleFilter === 'admin' ? u.isAdmin : !u.isAdmin);
      return matchSearch && matchGroup && matchRole;
    });
  }, [users, search, groupFilter, roleFilter]);

  const handleOpenAddUser = () => {
    setNewUsername('');
    setNewDisplayName('');
    setNewPassword('movieNight5');
    setNewIsAdmin(false);
    setFormError('');
    if (groups.length > 0) setNewGroupId(String(groups[0].id));
    setAddUserOpen(true);
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!newUsername.trim() || !newDisplayName.trim()) {
      setFormError('Username and Display Name are required');
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await api.adminCreateUser({
        username: newUsername.trim(),
        displayName: newDisplayName.trim(),
        groupId: Number(newGroupId) || 1,
        password: newPassword.trim() || 'movieNight5',
        isAdmin: newIsAdmin,
      });

      if (res.ok) {
        setAddUserOpen(false);
        showNotification(`Created user "${newDisplayName}" with default password "movieNight5"!`);
        loadData();
      }
    } catch (err) {
      setFormError(err.message || 'Failed to create user');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmReset = async () => {
    if (!resetTargetUser) return;
    try {
      setIsSubmitting(true);
      const res = await api.adminResetPassword(resetTargetUser.id);
      if (res.ok) {
        showNotification(`Password for ${resetTargetUser.displayName} reset to default (movieNight5)!`);
        setResetTargetUser(null);
      }
    } catch (err) {
      alert(err.message || 'Failed to reset password');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleAdmin = async (u) => {
    const action = u.isAdmin ? 'revoke admin from' : 'grant admin privileges to';
    if (!window.confirm(`Are you sure you want to ${action} ${u.displayName}?`)) return;

    try {
      const res = await api.adminToggleRole(u.id);
      if (res.ok) {
        showNotification(`${u.displayName} is now ${res.isAdmin ? 'an Administrator' : 'a regular Member'}.`);
        setUsers(prev => prev.map(item => item.id === u.id ? { ...item, isAdmin: res.isAdmin } : item));
      }
    } catch (err) {
      alert(err.message || 'Failed to update role');
    }
  };

  return (
    <div className="admin-page">
      {/* Top Notice */}
      <div className="admin-env-badge">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="admin-env-tag">Isolated DB</span>
          <span>
            Connected to <strong>movies-dev</strong> on Render. The live Oracle production server is completely untouched.
          </span>
        </div>
        <span style={{ color: 'var(--text2)', fontSize: 12 }}>Branch: <code>dev</code></span>
      </div>

      {/* Header Row */}
      <div className="admin-header-row">
        <div>
          <h1>⚙️ User & Club Administration</h1>
          <p className="admin-header-desc">
            Manage members, add users, grant admin privileges, and reset forgotten passwords to default (<code>movieNight5</code>).
          </p>
        </div>
        <div>
          <button className="btn btn-primary" onClick={handleOpenAddUser}>
            ➕ Add New Member
          </button>
        </div>
      </div>

      {toast && (
        <div className="admin-toast-banner">
          <span>✅ {toast}</span>
          <button
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}
            onClick={() => setToast(null)}
          >
            ✕
          </button>
        </div>
      )}

      {error && (
        <div style={{ padding: 16, background: 'rgba(242,97,97,0.15)', border: '1px solid var(--red)', borderRadius: 8, marginBottom: 20 }}>
          ⚠️ {error}
        </div>
      )}

      {/* Filters */}
      <div className="admin-filter-bar">
        <input
          type="text"
          className="admin-search-input"
          placeholder="Search by name, handle (@username)..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="admin-select"
          value={groupFilter}
          onChange={e => setGroupFilter(e.target.value)}
        >
          <option value="all">All Movie Clubs</option>
          {groups.map(g => (
            <option key={g.id} value={String(g.id)}>{g.name}</option>
          ))}
        </select>
        <select
          className="admin-select"
          value={roleFilter}
          onChange={e => setRoleFilter(e.target.value)}
        >
          <option value="all">All Roles</option>
          <option value="admin">Admins Only</option>
          <option value="member">Regular Members</option>
        </select>
      </div>

      {/* Table */}
      <div className="admin-table-card">
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text2)' }}>Loading users...</div>
        ) : filteredUsers.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text2)' }}>No members found matching criteria.</div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Clubs</th>
                <th>Permissions</th>
                <th>Ratings</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map(u => {
                const initials = u.displayName.slice(0, 2).toUpperCase();
                return (
                  <tr key={u.id}>
                    <td>
                      <div className="admin-user-cell">
                        <div className="admin-user-avatar">{initials}</div>
                        <div>
                          <div className="admin-user-name">{u.displayName}</div>
                          <div className="admin-user-handle">@{u.username}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      {u.groups && u.groups.length > 0 ? (
                        u.groups.map(g => (
                          <span key={g.id} className="admin-group-tag">
                            🎬 {g.name}
                          </span>
                        ))
                      ) : (
                        <span style={{ color: 'var(--text3)', fontSize: 12 }}>None</span>
                      )}
                    </td>
                    <td>
                      <span className={`admin-role-badge ${u.isAdmin ? 'admin' : 'member'}`}>
                        {u.isAdmin ? '👑 Site Admin' : 'Member'}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontWeight: 600 }}>{u.ratingsCount}</span>
                      <span style={{ color: 'var(--text2)', fontSize: 12 }}> votes</span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="admin-actions">
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => setResetTargetUser(u)}
                          title="Reset password to movieNight5"
                        >
                          🔑 Reset PW
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleToggleAdmin(u)}
                          title={u.isAdmin ? 'Demote to regular member' : 'Promote to site admin'}
                        >
                          {u.isAdmin ? 'Revoke Admin' : 'Make Admin'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* MODAL: RESET PASSWORD CONFIRMATION */}
      {resetTargetUser && (
        <div className="admin-modal-backdrop" onClick={() => !isSubmitting && setResetTargetUser(null)}>
          <div className="admin-modal" onClick={e => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3>🔑 Reset Member Password</h3>
              <button className="admin-modal-close" onClick={() => setResetTargetUser(null)}>✕</button>
            </div>
            <div className="admin-modal-body">
              <p style={{ marginBottom: 14 }}>
                Are you sure you want to reset the password for{' '}
                <strong style={{ color: '#fff' }}>{resetTargetUser.displayName}</strong> (
                <code>@{resetTargetUser.username}</code>)?
              </p>
              <div style={{
                background: 'var(--surface2)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '12px 16px',
                marginBottom: 16
              }}>
                <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 4 }}>Default Password:</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--gold)', letterSpacing: 0.5 }}>
                  movieNight5
                </div>
              </div>
              <p style={{ fontSize: 12.5, color: 'var(--text2)' }}>
                Tell the member to log in using <strong>movieNight5</strong>. Once logged in, they can change it to whatever they want by clicking their name in the header.
              </p>
            </div>
            <div className="admin-modal-footer">
              <button
                className="btn btn-secondary"
                disabled={isSubmitting}
                onClick={() => setResetTargetUser(null)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                disabled={isSubmitting}
                onClick={handleConfirmReset}
              >
                {isSubmitting ? 'Resetting...' : 'Confirm Reset'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD NEW MEMBER */}
      {addUserOpen && (
        <div className="admin-modal-backdrop" onClick={() => !isSubmitting && setAddUserOpen(false)}>
          <div className="admin-modal" onClick={e => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3>➕ Add New Club Member</h3>
              <button className="admin-modal-close" onClick={() => setAddUserOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleCreateUser}>
              <div className="admin-modal-body">
                {formError && (
                  <div style={{ padding: 10, background: 'rgba(242,97,97,0.15)', border: '1px solid var(--red)', borderRadius: 6, marginBottom: 14, fontSize: 12.5 }}>
                    ⚠️ {formError}
                  </div>
                )}

                <div className="admin-form-group">
                  <label>Username (Login Handle) *</label>
                  <input
                    type="text"
                    className="admin-form-input"
                    placeholder="e.g. eleni"
                    value={newUsername}
                    onChange={e => setNewUsername(e.target.value)}
                    required
                  />
                  <div className="admin-form-desc">Used to log in. Letters, numbers, or underscores.</div>
                </div>

                <div className="admin-form-group">
                  <label>Display Name (Voter Name) *</label>
                  <input
                    type="text"
                    className="admin-form-input"
                    placeholder="e.g. Έλενα"
                    value={newDisplayName}
                    onChange={e => setNewDisplayName(e.target.value)}
                    required
                  />
                  <div className="admin-form-desc">Shown on movie ratings, voter pills, and top 10 rankings.</div>
                </div>

                <div className="admin-form-group">
                  <label>Movie Club *</label>
                  <select
                    className="admin-form-input"
                    value={newGroupId}
                    onChange={e => setNewGroupId(e.target.value)}
                  >
                    {groups.map(g => (
                      <option key={g.id} value={String(g.id)}>{g.name}</option>
                    ))}
                  </select>
                </div>

                <div className="admin-form-group">
                  <label>Initial Password</label>
                  <input
                    type="text"
                    className="admin-form-input"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                  />
                  <div className="admin-form-desc">Defaults to <code>movieNight5</code>. Member can change it anytime.</div>
                </div>

                <div className="admin-form-group">
                  <label className="admin-checkbox-row">
                    <input
                      type="checkbox"
                      checked={newIsAdmin}
                      onChange={e => setNewIsAdmin(e.target.checked)}
                    />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13, color: '#fff' }}>Grant Site Administrator</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text2)' }}>Grants access to this Admin Console and group switching.</div>
                    </div>
                  </label>
                </div>
              </div>
              <div className="admin-modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={isSubmitting}
                  onClick={() => setAddUserOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Creating...' : 'Create Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
