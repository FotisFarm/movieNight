import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../api';
import { useAppConfig } from '../AppConfigContext';
import './Admin.css';

export default function Admin() {
  const { activeGroup, refreshConfig } = useAppConfig() || {};
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);

  // Active view tab: 'users' | 'clubs' | 'sessions'
  const [activeTab, setActiveTab] = useState('users');

  // Sessions state
  const [sessions, setSessions] = useState([]);
  const [sessionStats, setSessionStats] = useState({ totalActive: 0, totalExpired: 0, uniqueUsersCount: 0 });

  // Search & Filters
  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');

  // Switch Active Club bar state
  const [targetActiveGroupId, setTargetActiveGroupId] = useState('');
  const [isSwitchingActiveClub, setIsSwitchingActiveClub] = useState(false);

  // Modals state
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [createClubOpen, setCreateClubOpen] = useState(false);
  const [resetTargetUser, setResetTargetUser] = useState(null);
  const [editClubsTargetUser, setEditClubsTargetUser] = useState(null);
  const [selectedClubIds, setSelectedClubIds] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Add User Form State
  const [newUsername, setNewUsername] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newGroupId, setNewGroupId] = useState('1');
  const [newPassword, setNewPassword] = useState('movieNight5');
  const [newIsAdmin, setNewIsAdmin] = useState(false);
  const [formError, setFormError] = useState('');

  // Create Club Form State
  const [newClubName, setNewClubName] = useState('');
  const [newClubSlug, setNewClubSlug] = useState('');
  const [clubFormError, setClubFormError] = useState('');

  // Rename Club Form State
  const [renameClubTarget, setRenameClubTarget] = useState(null);
  const [renameClubName, setRenameClubName] = useState('');
  const [renameClubSlug, setRenameClubSlug] = useState('');
  const [renameFormError, setRenameFormError] = useState('');

  const showNotification = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4500);
  };

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');
      const [uList, gList, sData] = await Promise.all([
        api.adminGetUsers(),
        api.adminGetGroups().catch(() => []),
        api.adminGetSessions().catch(() => ({ sessions: [], stats: {} })),
      ]);
      setUsers(Array.isArray(uList) ? uList : []);
      setGroups(Array.isArray(gList) ? gList : []);
      setSessions(sData?.sessions || []);
      setSessionStats(sData?.stats || { totalActive: 0, totalExpired: 0, uniqueUsersCount: 0 });
      if (Array.isArray(gList) && gList.length > 0) {
        if (!newGroupId) setNewGroupId(String(gList[0].id));
        if (!targetActiveGroupId && activeGroup?.id) {
          setTargetActiveGroupId(String(activeGroup.id));
        }
      }
    } catch (err) {
      console.error('Failed to load admin data:', err);
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (activeGroup?.id) {
      setTargetActiveGroupId(String(activeGroup.id));
    }
  }, [activeGroup]);

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

  // Handle switching active club context
  const handleSwitchActiveClub = async (groupId) => {
    const targetId = Number(groupId || targetActiveGroupId);
    if (!targetId) return;
    try {
      setIsSwitchingActiveClub(true);
      const res = await api.switchGroup(targetId);
      if (res?.ok) {
        await refreshConfig?.();
        showNotification(`Active viewing club switched to: ${res.activeGroup?.name || 'Club #' + targetId}!`);
      }
    } catch (err) {
      alert(err.message || 'Failed to switch club');
    } finally {
      setIsSwitchingActiveClub(false);
    }
  };

  // Open Add User
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

  // Open Edit User Clubs
  const handleOpenEditClubs = (u) => {
    setEditClubsTargetUser(u);
    const existingIds = (u.groups || []).map(g => g.id);
    setSelectedClubIds(existingIds);
  };

  const handleToggleClubSelection = (clubId) => {
    setSelectedClubIds(prev =>
      prev.includes(clubId) ? prev.filter(id => id !== clubId) : [...prev, clubId]
    );
  };

  const handleSaveUserClubs = async () => {
    if (!editClubsTargetUser) return;
    try {
      setIsSubmitting(true);
      const res = await api.adminSetUserGroups(editClubsTargetUser.id, selectedClubIds);
      if (res.ok) {
        showNotification(`Updated club memberships for ${editClubsTargetUser.displayName}!`);
        setEditClubsTargetUser(null);
        loadData();
      }
    } catch (err) {
      alert(err.message || 'Failed to update user clubs');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Create Club
  const handleOpenCreateClub = () => {
    setNewClubName('');
    setNewClubSlug('');
    setClubFormError('');
    setCreateClubOpen(true);
  };

  const handleCreateClub = async (e) => {
    e.preventDefault();
    setClubFormError('');
    if (!newClubName.trim()) {
      setClubFormError('Club Name is required');
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await api.createGroup({
        name: newClubName.trim(),
        slug: newClubSlug.trim() || undefined,
      });

      if (res.id) {
        setCreateClubOpen(false);
        showNotification(`Club "${newClubName}" created successfully!`);
        loadData();
      }
    } catch (err) {
      setClubFormError(err.message || 'Failed to create club');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open & Save Rename Club
  const handleOpenRenameClub = (g) => {
    setRenameClubTarget(g);
    setRenameClubName(g.name);
    setRenameClubSlug(g.slug || '');
    setRenameFormError('');
  };

  const handleSaveRenameClub = async (e) => {
    e.preventDefault();
    if (!renameClubTarget) return;
    setRenameFormError('');
    if (!renameClubName.trim()) {
      setRenameFormError('Club Name is required');
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await api.adminUpdateGroup(renameClubTarget.id, {
        name: renameClubName.trim(),
        slug: renameClubSlug.trim() || undefined,
      });

      if (res.ok || res.group) {
        showNotification(`Club renamed to "${renameClubName.trim()}" successfully!`);
        setRenameClubTarget(null);
        await loadData();
        if (activeGroup?.id === renameClubTarget.id) {
          refreshConfig?.();
        }
      }
    } catch (err) {
      setRenameFormError(err.message || 'Failed to rename club');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Password reset
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

  // Role toggle
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

  // Revoke a single active session
  const handleRevokeSession = async (sid, isCurrentDevice, displayName) => {
    const warning = isCurrentDevice
      ? '⚠️ Warning: This is your CURRENT browser session. If you revoke it, you will be logged out immediately. Continue?'
      : `Revoke active session for "${displayName}"? The member will be required to log in again on that device.`;
    if (!window.confirm(warning)) return;

    try {
      const res = await api.adminRevokeSession(sid);
      if (res?.ok) {
        if (isCurrentDevice) {
          window.location.reload();
          return;
        }
        showNotification(`Session for "${displayName}" was revoked successfully!`);
        loadData();
      }
    } catch (err) {
      alert(err.message || 'Failed to revoke session');
    }
  };

  // Prune all expired sessions
  const handlePruneSessions = async () => {
    try {
      const res = await api.adminPruneSessions();
      if (res?.ok) {
        showNotification(`Pruned ${res.prunedCount} expired session(s) from database!`);
        loadData();
      }
    } catch (err) {
      alert(err.message || 'Failed to prune sessions');
    }
  };

  return (
    <div className="admin-page">
      {/* Top Notice */}
      <div className="admin-env-badge">
        <div className="admin-env-badge-left">
          <span className="admin-env-tag">Isolated DB</span>
          <span className="admin-env-desc">
            Connected to <strong>movies-dev</strong> on Render.
          </span>
        </div>
        <span className="admin-env-branch">Branch: <code>dev</code></span>
      </div>

      {/* ACTIVE CLUB CONTEXT BAR (Instant switcher) */}
      <div className="admin-active-club-bar">
        <div className="admin-active-club-info">
          <span className="admin-active-club-label">Active Club:</span>
          <div className="admin-active-club-badge">
            <span>🎬</span>
            <span>{activeGroup?.name || 'The Originals'}</span>
          </div>
        </div>

        {groups.length > 1 && (
          <div className="admin-club-switcher-control">
            <select
              className="admin-select admin-club-select"
              value={targetActiveGroupId}
              onChange={e => {
                const newId = e.target.value;
                setTargetActiveGroupId(newId);
                if (newId && Number(newId) !== activeGroup?.id) {
                  handleSwitchActiveClub(newId);
                }
              }}
              title="Switch active movie club context"
            >
              {groups.map(g => (
                <option key={g.id} value={String(g.id)}>
                  {g.id === activeGroup?.id ? `✓ ${g.name} (Active)` : `Switch to: ${g.name}`}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Header Row */}
      <div className="admin-header-row">
        <div className="admin-header-title-wrap">
          <h1>⚙️ Administration</h1>
          <p className="admin-header-desc">
            Manage member club assignments, add users, grant admin privileges, and reset passwords.
          </p>
        </div>
        <div className="admin-header-actions">
          <button className="btn btn-secondary btn-sm" onClick={handleOpenCreateClub}>
            ➕ Club
          </button>
          <button className="btn btn-primary btn-sm" onClick={handleOpenAddUser}>
            ➕ Member
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

      {/* Admin Navigation Tabs */}
      <div className="admin-nav-tabs">
        <button
          className={`admin-nav-tab ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          <span>👥</span> Members ({users.length})
        </button>
        <button
          className={`admin-nav-tab ${activeTab === 'clubs' ? 'active' : ''}`}
          onClick={() => setActiveTab('clubs')}
        >
          <span>🎬</span> Movie Clubs ({groups.length})
        </button>
        <button
          className={`admin-nav-tab ${activeTab === 'sessions' ? 'active' : ''}`}
          onClick={() => setActiveTab('sessions')}
        >
          <span>🛡️</span> Active Sessions ({sessionStats?.totalActive ?? sessions.length})
        </button>
      </div>

      {/* VIEW 1: MEMBERS */}
      {activeTab === 'users' && (
        <>
          {/* Filters */}
          <div className="admin-filter-bar">
            <input
              type="text"
              className="admin-search-input"
              placeholder="Search by name, handle (@username)..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <div className="admin-filter-dropdowns">
              <select
                className="admin-select"
                value={groupFilter}
                onChange={e => setGroupFilter(e.target.value)}
              >
                <option value="all">All Clubs</option>
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
                <option value="member">Members</option>
              </select>
            </div>
          </div>

          {/* Table & Mobile Cards */}
          <div className="admin-table-card">
            {loading ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text2)' }}>Loading users...</div>
            ) : filteredUsers.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text2)' }}>No members found matching criteria.</div>
            ) : (
              <>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Member</th>
                      <th>Movie Clubs</th>
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
                            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
                              {u.groups && u.groups.length > 0 ? (
                                u.groups.map(g => (
                                  <span key={g.id} className="admin-group-tag">
                                    🎬 {g.name}
                                  </span>
                                ))
                              ) : (
                                <span style={{ color: 'var(--text3)', fontSize: 12 }}>No Clubs</span>
                              )}
                              <button
                                type="button"
                                className="admin-edit-clubs-btn"
                                onClick={() => handleOpenEditClubs(u)}
                                title="Change clubs for this user"
                              >
                                ✏️ Change
                              </button>
                            </div>
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
                                onClick={() => handleOpenEditClubs(u)}
                                title="Change which clubs this member belongs to"
                              >
                                🎬 Clubs
                              </button>
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

                {/* Mobile Responsive Cards (visible <= 680px) */}
                <div className="admin-mobile-cards">
                  {filteredUsers.map(u => {
                    const initials = u.displayName.slice(0, 2).toUpperCase();
                    return (
                      <div key={u.id} className="admin-member-card">
                        <div className="admin-card-header">
                          <div className="admin-user-cell">
                            <div className="admin-user-avatar">{initials}</div>
                            <div>
                              <div className="admin-user-name">{u.displayName}</div>
                              <div className="admin-user-handle">@{u.username}</div>
                            </div>
                          </div>
                          <span className={`admin-role-badge ${u.isAdmin ? 'admin' : 'member'}`}>
                            {u.isAdmin ? '👑 Admin' : 'Member'}
                          </span>
                        </div>

                        <div className="admin-card-clubs-row">
                          <div className="admin-card-section-label">Movie Clubs:</div>
                          <div className="admin-card-chips">
                            {u.groups && u.groups.length > 0 ? (
                              u.groups.map(g => (
                                <span key={g.id} className="admin-group-tag">
                                  🎬 {g.name}
                                </span>
                              ))
                            ) : (
                              <span style={{ color: 'var(--text3)', fontSize: 12 }}>No Clubs</span>
                            )}
                            <button
                              type="button"
                              className="admin-edit-clubs-btn"
                              onClick={() => handleOpenEditClubs(u)}
                              title="Change clubs for this user"
                            >
                              ✏️ Change
                            </button>
                          </div>
                        </div>

                        <div className="admin-card-meta-row">
                          <span className="admin-card-stat">
                            ⭐ <strong>{u.ratingsCount}</strong> votes recorded
                          </span>
                        </div>

                        <div className="admin-card-actions">
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleOpenEditClubs(u)}
                            title="Change clubs"
                          >
                            🎬 Clubs
                          </button>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => setResetTargetUser(u)}
                            title="Reset password"
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
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </>
      )}

      {/* VIEW 2: MOVIE CLUBS */}
      {activeTab === 'clubs' && (
        <div className="admin-clubs-grid">
          {groups.map(g => {
            const isActiveClub = g.id === activeGroup?.id;
            return (
              <div key={g.id} className={`admin-club-box ${isActiveClub ? 'is-active' : ''}`}>
                <div>
                  <div className="admin-club-box-header">
                    <div>
                      <div className="admin-club-box-title">
                        <span>🎬</span> {g.name}
                      </div>
                      <div className="admin-club-box-slug">
                        Slug: <code>{g.slug}</code> (ID: #{g.id})
                      </div>
                    </div>
                    {isActiveClub && (
                      <span className="admin-role-badge admin">Active Context</span>
                    )}
                  </div>

                  <div className="admin-club-box-stats">
                    <div>• <strong>{g.member_count ?? 0}</strong> Registered Members</div>
                    <div>• Private ratings, top 10s, and watchlist</div>
                  </div>
                </div>

                <div className="admin-club-box-footer">
                  <span style={{ fontSize: 12, color: 'var(--text2)' }}>
                    Created: {g.created_at ? new Date(g.created_at).toLocaleDateString() : 'Initial'}
                  </span>
                  <div className="admin-club-box-actions">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleOpenRenameClub(g)}
                      title={`Rename "${g.name}"`}
                    >
                      ✏️ Rename
                    </button>
                    <button
                      className={`btn btn-sm ${isActiveClub ? 'btn-ghost' : 'btn-secondary'}`}
                      disabled={isActiveClub || isSwitchingActiveClub}
                      onClick={() => handleSwitchActiveClub(g.id)}
                    >
                      {isActiveClub ? '✓ Currently Active' : 'Switch Context Here'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* VIEW 3: ACTIVE SESSIONS */}
      {activeTab === 'sessions' && (
        <div>
          {/* Stats Overview */}
          <div className="admin-stats-overview">
            <div className="admin-stat-card">
              <div className="admin-stat-label">Active Sessions</div>
              <div className="admin-stat-value">
                <span style={{ color: 'var(--green)', fontSize: 16 }}>●</span>
                {sessionStats?.totalActive ?? sessions.length}
              </div>
              <div className="admin-stat-sub">Live browser sessions in database</div>
            </div>

            <div className="admin-stat-card">
              <div className="admin-stat-label">Unique Members Online</div>
              <div className="admin-stat-value">
                <span style={{ fontSize: 20 }}>👥</span>
                {sessionStats?.uniqueUsersCount ?? 0}
              </div>
              <div className="admin-stat-sub">Distinct member accounts</div>
            </div>

            <div className="admin-stat-card">
              <div className="admin-stat-label">Persistence Engine</div>
              <div className="admin-stat-value" style={{ fontSize: 18, color: 'var(--gold)' }}>
                Turso DB (30d)
              </div>
              <div className="admin-stat-sub">Survives Render deploys & restarts</div>
            </div>

            <div className="admin-stat-card">
              <div className="admin-stat-label">Expired in Database</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="admin-stat-value" style={{ fontSize: 20 }}>
                  {sessionStats?.totalExpired ?? 0}
                </div>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={handlePruneSessions}
                  disabled={!sessionStats?.totalExpired}
                  title="Delete expired sessions from database"
                >
                  🧹 Prune
                </button>
              </div>
              <div className="admin-stat-sub">Pending database cleanup</div>
            </div>
          </div>

          {/* Sessions Table & Mobile Cards */}
          <div className="admin-table-card">
            {sessions.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text2)' }}>
                No active sessions found.
              </div>
            ) : (
              <>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Member</th>
                      <th>Session ID / Device</th>
                      <th>Club Scope</th>
                      <th>Status</th>
                      <th>Expires In</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map(s => {
                      const daysLeft = Math.max(0, Math.round((s.expiresAt - Date.now()) / (24 * 60 * 60 * 1000)));
                      return (
                        <tr key={s.sid}>
                          <td>
                            <div className="admin-user-cell">
                              <div className="admin-user-avatar">
                                {s.displayName.slice(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <div className="admin-user-name">{s.displayName}</div>
                                <div className="admin-user-handle">@{s.username}</div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span className="admin-session-device">{s.maskedSid}</span>
                              {s.isCurrentDevice && (
                                <span className="admin-session-badge current" title="Your current browser session">
                                  ⭐ This Device
                                </span>
                              )}
                            </div>
                          </td>
                          <td>
                            <span className="admin-group-tag">🎬 {s.activeGroupName}</span>
                          </td>
                          <td>
                            <span className="admin-session-badge active">● Active</span>
                          </td>
                          <td>
                            <span title={new Date(s.expiresAt).toLocaleString()} style={{ color: 'var(--text)' }}>
                              in {daysLeft} {daysLeft === 1 ? 'day' : 'days'}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <button
                              className="btn btn-danger btn-sm"
                              onClick={() => handleRevokeSession(s.sid, s.isCurrentDevice, s.displayName)}
                              title="Log out this device immediately"
                            >
                              🚫 Revoke
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Mobile Responsive Cards for Sessions (visible <= 680px) */}
                <div className="admin-mobile-cards">
                  {sessions.map(s => {
                    const daysLeft = Math.max(0, Math.round((s.expiresAt - Date.now()) / (24 * 60 * 60 * 1000)));
                    const initials = s.displayName.slice(0, 2).toUpperCase();
                    return (
                      <div key={s.sid} className="admin-member-card">
                        <div className="admin-card-header">
                          <div className="admin-user-cell">
                            <div className="admin-user-avatar">{initials}</div>
                            <div>
                              <div className="admin-user-name">{s.displayName}</div>
                              <div className="admin-user-handle">@{s.username}</div>
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                            {s.isCurrentDevice && (
                              <span className="admin-session-badge current">⭐ You</span>
                            )}
                            <span className="admin-session-badge active">● Active</span>
                          </div>
                        </div>

                        <div className="admin-card-meta-row">
                          <span><strong>Club:</strong> 🎬 {s.activeGroupName}</span>
                          <span><strong>Expires:</strong> {daysLeft} {daysLeft === 1 ? 'day' : 'days'}</span>
                        </div>

                        <div style={{ fontSize: 11.5, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span>Session ID:</span>
                          <code className="admin-session-device">{s.maskedSid}</code>
                        </div>

                        <div className="admin-card-actions">
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => handleRevokeSession(s.sid, s.isCurrentDevice, s.displayName)}
                            title="Log out this device immediately"
                            style={{ width: '100%', justifyContent: 'center' }}
                          >
                            {s.isCurrentDevice ? '🚪 Sign Out (This Device)' : '🚫 Revoke Session'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* MODAL: EDIT USER CLUBS */}
      {editClubsTargetUser && (
        <div className="admin-modal-backdrop" onClick={() => !isSubmitting && setEditClubsTargetUser(null)}>
          <div className="admin-modal" onClick={e => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3>🎬 Change Clubs for {editClubsTargetUser.displayName}</h3>
              <button className="admin-modal-close" onClick={() => setEditClubsTargetUser(null)}>✕</button>
            </div>
            <div className="admin-modal-body">
              <p style={{ fontSize: 13.5, color: 'var(--text2)', marginBottom: 16 }}>
                Select which movie club(s) <strong>{editClubsTargetUser.displayName}</strong> (@{editClubsTargetUser.username}) should belong to:
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                {groups.map(g => {
                  const isChecked = selectedClubIds.includes(g.id);
                  return (
                    <label
                      key={g.id}
                      className="admin-checkbox-row"
                      style={{ border: isChecked ? '1px solid var(--accent)' : '1px solid var(--border)' }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleClubSelection(g.id)}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 13.5, color: '#fff' }}>
                          🎬 {g.name}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text2)' }}>
                          Slug: <code>{g.slug}</code>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>

              <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                * Users can belong to multiple clubs. Their ratings and top 10 lists remain scoped to their respective clubs.
              </div>
            </div>
            <div className="admin-modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={isSubmitting}
                onClick={() => setEditClubsTargetUser(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={isSubmitting}
                onClick={handleSaveUserClubs}
              >
                {isSubmitting ? 'Saving...' : 'Save Club Assignments'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CREATE NEW CLUB */}
      {createClubOpen && (
        <div className="admin-modal-backdrop" onClick={() => !isSubmitting && setCreateClubOpen(false)}>
          <div className="admin-modal" onClick={e => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3>🎬 Create New Movie Club</h3>
              <button className="admin-modal-close" onClick={() => setCreateClubOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleCreateClub}>
              <div className="admin-modal-body">
                {clubFormError && (
                  <div style={{ padding: 10, background: 'rgba(242,97,97,0.15)', border: '1px solid var(--red)', borderRadius: 6, marginBottom: 14, fontSize: 12.5 }}>
                    ⚠️ {clubFormError}
                  </div>
                )}

                <div className="admin-form-group">
                  <label>Club Name *</label>
                  <input
                    type="text"
                    className="admin-form-input"
                    placeholder="e.g. Film Club II or Cinema Society"
                    value={newClubName}
                    onChange={e => setNewClubName(e.target.value)}
                    required
                  />
                  <div className="admin-form-desc">The human-readable title of the movie club.</div>
                </div>

                <div className="admin-form-group">
                  <label>Slug (URL Handle, optional)</label>
                  <input
                    type="text"
                    className="admin-form-input"
                    placeholder="e.g. film-club-ii (auto-generated if empty)"
                    value={newClubSlug}
                    onChange={e => setNewClubSlug(e.target.value)}
                  />
                  <div className="admin-form-desc">Used for URLs and internal club identification.</div>
                </div>
              </div>
              <div className="admin-modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={isSubmitting}
                  onClick={() => setCreateClubOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Creating...' : 'Create Club'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: RENAME MOVIE CLUB */}
      {renameClubTarget && (
        <div className="admin-modal-backdrop" onClick={() => !isSubmitting && setRenameClubTarget(null)}>
          <div className="admin-modal" onClick={e => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3>✏️ Rename Movie Club</h3>
              <button className="admin-modal-close" onClick={() => setRenameClubTarget(null)}>✕</button>
            </div>
            <form onSubmit={handleSaveRenameClub}>
              <div className="admin-modal-body">
                {renameFormError && (
                  <div style={{ padding: 10, background: 'rgba(242,97,97,0.15)', border: '1px solid var(--red)', borderRadius: 6, marginBottom: 14, fontSize: 12.5 }}>
                    ⚠️ {renameFormError}
                  </div>
                )}

                <div className="admin-form-group">
                  <label>Club Name *</label>
                  <input
                    type="text"
                    className="admin-form-input"
                    placeholder="e.g. The Originals, Movie Nights II"
                    value={renameClubName}
                    onChange={e => setRenameClubName(e.target.value)}
                    required
                    autoFocus
                  />
                  <div className="admin-form-desc">The human-readable display title of the club.</div>
                </div>

                <div className="admin-form-group">
                  <label>Slug (URL Handle)</label>
                  <input
                    type="text"
                    className="admin-form-input"
                    placeholder="e.g. movie-nights-ii"
                    value={renameClubSlug}
                    onChange={e => setRenameClubSlug(e.target.value)}
                  />
                  <div className="admin-form-desc">Unique identifier used for club URLs and routing.</div>
                </div>
              </div>
              <div className="admin-modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={isSubmitting}
                  onClick={() => setRenameClubTarget(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
