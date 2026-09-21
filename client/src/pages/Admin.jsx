import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../api';
import { useAppConfig } from '../AppConfigContext';
import './Admin.css';

export default function Admin() {
  const { activeGroup, refreshConfig, sandboxMode } = useAppConfig() || {};
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
  const [selectedClubRoles, setSelectedClubRoles] = useState({}); // clubId -> 'admin' | 'member'
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Add User Form State
  const [newUsername, setNewUsername] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newGroupId, setNewGroupId] = useState('1');
  const [newPassword, setNewPassword] = useState('movieNight5');
  const [newIsAdmin, setNewIsAdmin] = useState(false);
  const [newIsGroupAdmin, setNewIsGroupAdmin] = useState(false);
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
        || (roleFilter === 'admin' || roleFilter === 'siteAdmin' ? u.isAdmin : false)
        || (roleFilter === 'groupAdmin' ? (!u.isAdmin && u.groups?.some(g => g.role === 'admin')) : false)
        || (roleFilter === 'member' ? (!u.isAdmin && !u.groups?.some(g => g.role === 'admin')) : false);
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
    setNewIsGroupAdmin(false);
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
        groupRole: (!newIsAdmin && newIsGroupAdmin) ? 'admin' : 'member',
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
    const roles = {};
    (u.groups || []).forEach(g => {
      roles[g.id] = g.role || 'member';
    });
    setSelectedClubRoles(roles);
  };

  const handleToggleClubSelection = (clubId) => {
    setSelectedClubIds(prev =>
      prev.includes(clubId) ? prev.filter(id => id !== clubId) : [...prev, clubId]
    );
    setSelectedClubRoles(prev => {
      if (!prev[clubId]) {
        return { ...prev, [clubId]: 'member' };
      }
      return prev;
    });
  };

  const handleClubRoleChange = (clubId, role) => {
    setSelectedClubRoles(prev => ({ ...prev, [clubId]: role }));
  };

  const handleSaveUserClubs = async () => {
    if (!editClubsTargetUser) return;
    try {
      setIsSubmitting(true);
      const res = await api.adminSetUserGroups(editClubsTargetUser.id, selectedClubIds, selectedClubRoles);
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

  // Letterboxd Sync State

  const [syncData, setSyncData] = useState(null);
  const [syncLoading, setSyncLoading] = useState(false);
  const [isSyncTriggering, setIsSyncTriggering] = useState(false);
  const [forceAllSync, setForceAllSync] = useState(false);

  const loadSyncData = async () => {
    try {
      setSyncLoading(true);
      const data = await api.adminGetLetterboxdSyncStatus();
      setSyncData(data);
    } catch (err) {
      console.warn('Failed to load sync status:', err);
    } finally {
      setSyncLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'sync') {
      loadSyncData();
    }
  }, [activeTab]);

  useEffect(() => {
    let timer;
    if (activeTab === 'sync' || syncData?.sync?.isRunning) {
      timer = setInterval(async () => {
        try {
          const data = await api.adminGetLetterboxdSyncStatus();
          setSyncData(data);
          if (!data?.sync?.isRunning && syncData?.sync?.isRunning) {
            showNotification('Letterboxd sync completed!');
          }
        } catch (_) {}
      }, 3000);
    }
    return () => timer && clearInterval(timer);
  }, [activeTab, syncData?.sync?.isRunning]);

  const handleTriggerSync = async () => {
    try {
      setIsSyncTriggering(true);
      const res = await api.adminRunLetterboxdSync({ forceAll: forceAllSync });
      if (res.ok) {
        showNotification(forceAllSync ? 'Started full catalog Letterboxd sync' : 'Started daily Letterboxd sync');
        loadSyncData();
      } else {
        alert(res.message || 'Could not start sync');
      }
    } catch (err) {
      alert(err.message || 'Failed to start sync');
    } finally {
      setIsSyncTriggering(false);
    }
  };

  const handleStopSync = async () => {
    try {
      const res = await api.adminStopLetterboxdSync();
      if (res.ok) {
        showNotification('Sync cancellation requested');
        loadSyncData();
      }
    } catch (err) {
      alert(err.message || 'Failed to stop sync');
    }
  };

  return (

    <div className="admin-page">
      {/* Top Notice (Only displayed in Sandbox mode) */}
      {sandboxMode && (
        <div className="admin-env-badge">
          <div className="admin-env-badge-left">
            <span className="admin-env-tag">Sandbox Mode</span>
            <span className="admin-env-desc">
              Connected to isolated sandbox environment (<code>port 3002</code>). Production database is untouched.
            </span>
          </div>
        </div>
      )}

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
        <button
          className={`admin-nav-tab ${activeTab === 'sync' ? 'active' : ''}`}
          onClick={() => setActiveTab('sync')}
        >
          <span>🔄</span> Letterboxd Sync
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
                <option value="siteAdmin">Site Admins Only</option>
                <option value="groupAdmin">Group Admins Only</option>
                <option value="member">Regular Members</option>
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
                            {u.username === 'mnAdmin' ? (
                              <span className="admin-group-tag" style={{ background: 'rgba(212, 160, 23, 0.15)', borderColor: 'var(--gold)', color: 'var(--gold)', fontWeight: 600 }}>
                                👑 All Clubs (System Admin)
                              </span>
                            ) : (
                              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
                                {u.groups && u.groups.length > 0 ? (
                                  u.groups.map(g => (
                                    <span
                                      key={g.id}
                                      className="admin-group-tag"
                                      style={g.role === 'admin' ? { borderColor: '#ffd54f', color: '#ffd54f', background: 'rgba(255, 213, 79, 0.12)' } : undefined}
                                      title={g.role === 'admin' ? `Group Admin of ${g.name}` : `Member of ${g.name}`}
                                    >
                                      🎬 {g.name}{g.role === 'admin' ? ' (Admin)' : ''}
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
                            )}
                          </td>
                          <td>
                            {u.isAdmin ? (
                              <span className="admin-role-badge admin">👑 Site Admin</span>
                            ) : u.groups?.some(g => g.role === 'admin') ? (
                              <span
                                className="admin-role-badge"
                                style={{
                                  background: 'rgba(255, 213, 79, 0.15)',
                                  color: '#ffd54f',
                                  border: '1px solid rgba(255, 213, 79, 0.35)',
                                  fontWeight: 600,
                                }}
                                title={`Group Admin of: ${u.groups.filter(g => g.role === 'admin').map(g => g.name).join(', ')}`}
                              >
                                👑 Group Admin
                              </span>
                            ) : (
                              <span className="admin-role-badge member">Member</span>
                            )}
                          </td>
                          <td>
                            <span style={{ fontWeight: 600 }}>{u.ratingsCount}</span>
                            <span style={{ color: 'var(--text2)', fontSize: 12 }}> votes</span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div className="admin-actions">
                              {u.username !== 'mnAdmin' && (
                                <button
                                  className="btn btn-secondary btn-sm"
                                  onClick={() => handleOpenEditClubs(u)}
                                  title="Change which clubs this member belongs to"
                                >
                                  🎬 Clubs
                                </button>
                              )}
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
                          {u.isAdmin ? (
                            <span className="admin-role-badge admin">👑 Site Admin</span>
                          ) : u.groups?.some(g => g.role === 'admin') ? (
                            <span
                              className="admin-role-badge"
                              style={{
                                background: 'rgba(255, 213, 79, 0.15)',
                                color: '#ffd54f',
                                border: '1px solid rgba(255, 213, 79, 0.35)',
                                fontWeight: 600,
                              }}
                              title={`Group Admin of: ${u.groups.filter(g => g.role === 'admin').map(g => g.name).join(', ')}`}
                            >
                              👑 Group Admin
                            </span>
                          ) : (
                            <span className="admin-role-badge member">Member</span>
                          )}
                        </div>

                        <div className="admin-card-clubs-row">
                          <div className="admin-card-section-label">Movie Clubs:</div>
                          <div className="admin-card-chips">
                            {u.username === 'mnAdmin' ? (
                              <span className="admin-group-tag" style={{ background: 'rgba(212, 160, 23, 0.15)', borderColor: 'var(--gold)', color: 'var(--gold)', fontWeight: 600 }}>
                                👑 All Clubs (System Admin)
                              </span>
                            ) : (
                              <>
                                {u.groups && u.groups.length > 0 ? (
                                  u.groups.map(g => (
                                    <span
                                      key={g.id}
                                      className="admin-group-tag"
                                      style={g.role === 'admin' ? { borderColor: '#ffd54f', color: '#ffd54f', background: 'rgba(255, 213, 79, 0.12)' } : undefined}
                                      title={g.role === 'admin' ? `Group Admin of ${g.name}` : `Member of ${g.name}`}
                                    >
                                      🎬 {g.name}{g.role === 'admin' ? ' (Admin)' : ''}
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
                              </>
                            )}
                          </div>
                        </div>

                        <div className="admin-card-meta-row">
                          <span className="admin-card-stat">
                            ⭐ <strong>{u.ratingsCount}</strong> votes recorded
                          </span>
                        </div>

                        <div className="admin-card-actions">
                          {u.username !== 'mnAdmin' && (
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => handleOpenEditClubs(u)}
                              title="Change clubs"
                            >
                              🎬 Clubs
                            </button>
                          )}
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

      {/* VIEW 4: LETTERBOXD SYNC & DATA */}
      {activeTab === 'sync' && (
        <div>
          {/* Stats Overview */}
          <div className="admin-stats-overview">
            <div className="admin-stat-card">
              <div className="admin-stat-label">Daily Scheduler</div>
              <div className="admin-stat-value" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: syncData?.sync?.isRunning ? 'var(--gold)' : 'var(--green)', fontSize: 16 }}>●</span>
                {syncData?.sync?.isRunning ? 'Syncing...' : 'Active (24h)'}
              </div>
              <div className="admin-stat-sub">
                {syncData?.sync?.isRunning
                  ? `Checking: ${syncData.sync.currentProgress?.movieTitle || 'In progress'}`
                  : 'Automatic background synchronization'}
              </div>
            </div>

            <div className="admin-stat-card">
              <div className="admin-stat-label">Catalog Rated</div>
              <div className="admin-stat-value">
                <span>⭐</span> {syncData?.catalog?.with_rating ?? '–'} <span style={{ fontSize: 14, color: 'var(--text3)' }}>/ {syncData?.catalog?.total ?? '–'}</span>
              </div>
              <div className="admin-stat-sub">
                {syncData?.catalog?.with_imdb ?? 0} films linked with IMDb ID
              </div>
            </div>

            <div className="admin-stat-card">
              <div className="admin-stat-label">Synced in Last 24h</div>
              <div className="admin-stat-value" style={{ color: 'var(--accent)' }}>
                {syncData?.catalog?.synced_last_24h ?? 0}
              </div>
              <div className="admin-stat-sub">Up to date with Letterboxd</div>
            </div>

            <div className="admin-stat-card">
              <div className="admin-stat-label">Decoy Protections</div>
              <div className="admin-stat-value" style={{ color: '#60a5fa' }}>
                🛡️ {syncData?.sync?.lastRun?.decoysBlocked ?? 0}
              </div>
              <div className="admin-stat-sub">3.43 bot honeypots blocked</div>
            </div>
          </div>

          {/* Sync Control Card */}
          <div className="admin-table-card" style={{ padding: 24, marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginBottom: 20 }}>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>🔄</span> Letterboxd Synchronization Manager
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text2)' }}>
                  Keeps Letterboxd community star ratings updated across the entire catalog once a day.
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={loadSyncData}
                  disabled={syncLoading}
                  title="Refresh sync status"
                >
                  {syncLoading ? 'Refreshing...' : '🔄 Refresh Status'}
                </button>

                {syncData?.sync?.isRunning ? (
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={handleStopSync}
                  >
                    ⏹️ Stop Sync
                  </button>
                ) : (
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={handleTriggerSync}
                    disabled={isSyncTriggering}
                  >
                    {isSyncTriggering ? 'Starting...' : '🚀 Run Letterboxd Sync Now'}
                  </button>
                )}
              </div>
            </div>

            {/* If actively running, display progress bar */}
            {syncData?.sync?.isRunning && (
              <div style={{ background: 'var(--surface2)', padding: 16, borderRadius: 8, border: '1px solid var(--border)', marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, fontSize: 13 }}>
                  <span style={{ fontWeight: 600, color: 'var(--gold)' }}>
                    Sync in progress: {syncData.sync.currentProgress?.current || 0} / {syncData.sync.currentProgress?.total || 0} films
                  </span>
                  <span style={{ color: 'var(--text2)' }}>
                    {syncData.sync.currentProgress?.percent || 0}%
                  </span>
                </div>
                <div style={{ width: '100%', height: 8, background: 'rgba(255,255,255,0.1)', borderRadius: 99, overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${syncData.sync.currentProgress?.percent || 0}%`,
                      background: 'linear-gradient(90deg, var(--gold), var(--accent))',
                      transition: 'width 0.3s ease'
                    }}
                  />
                </div>
                {syncData.sync.currentProgress?.movieTitle && (
                  <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text3)' }}>
                    Checking: <em>{syncData.sync.currentProgress.movieTitle}</em>
                  </div>
                )}
              </div>
            )}

            {/* Options */}
            {!syncData?.sync?.isRunning && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontSize: 13, color: 'var(--text2)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={forceAllSync}
                    onChange={e => setForceAllSync(e.target.checked)}
                  />
                  <span>Force re-check all films (bypass 24-hour cache window)</span>
                </label>
              </div>
            )}

            {/* Last Run Summary Card */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
              <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700, color: 'var(--text3)', marginBottom: 10 }}>
                Last Background Sync Run
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, fontSize: 13 }}>
                <div>
                  <span style={{ color: 'var(--text3)' }}>Status: </span>
                  <strong style={{ textTransform: 'capitalize' }}>{syncData?.sync?.lastRun?.status || 'Never run'}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text3)' }}>Films Checked: </span>
                  <strong>{syncData?.sync?.lastRun?.totalChecked ?? 0}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text3)' }}>Ratings Updated: </span>
                  <strong style={{ color: 'var(--green)' }}>{syncData?.sync?.lastRun?.updatedCount ?? 0}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text3)' }}>Decoys Blocked: </span>
                  <strong style={{ color: '#60a5fa' }}>{syncData?.sync?.lastRun?.decoysBlocked ?? 0}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text3)' }}>Skipped (Current): </span>
                  <strong>{syncData?.sync?.lastRun?.skippedCount ?? 0}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text3)' }}>Errors: </span>
                  <strong style={{ color: (syncData?.sync?.lastRun?.errorsCount || 0) > 0 ? 'var(--red)' : 'var(--text2)' }}>
                    {syncData?.sync?.lastRun?.errorsCount ?? 0}
                  </strong>
                </div>
              </div>
              {syncData?.sync?.lastRun?.finishedAt && (
                <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text3)', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 10 }}>
                  Completed at: {new Date(syncData.sync.lastRun.finishedAt).toLocaleString()}
                </div>
              )}
            </div>

            {/* Safety & Countermeasure Notice */}
            <div style={{ marginTop: 16, padding: 12, background: 'rgba(96, 165, 250, 0.08)', border: '1px solid rgba(96, 165, 250, 0.25)', borderRadius: 8, fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.5 }}>
              🛡️ <strong>Anti-Scraping Honeypot Protection:</strong> Letterboxd now serves a static placeholder rating of <code>3.43</code> to unauthenticated automated requests. The sync engine automatically identifies and blocks this decoy so existing authentic ratings in the catalog are never overwritten.
            </div>
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
                  const currentRole = selectedClubRoles[g.id] || 'member';
                  return (
                    <div
                      key={g.id}
                      className="admin-checkbox-row"
                      style={{
                        border: isChecked ? '1px solid var(--accent)' : '1px solid var(--border)',
                        background: isChecked ? 'rgba(229, 9, 20, 0.04)' : undefined,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        borderRadius: 8,
                        gap: 12,
                      }}
                    >
                      <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', flex: 1, margin: 0 }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleClubSelection(g.id)}
                        />
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13.5, color: '#fff' }}>
                            🎬 {g.name}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text2)' }}>
                            Slug: <code>{g.slug}</code>
                          </div>
                        </div>
                      </label>
                      {isChecked && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 12, color: 'var(--text3)' }}>Role:</span>
                          <select
                            value={currentRole}
                            onChange={e => handleClubRoleChange(g.id, e.target.value)}
                            style={{
                              padding: '5px 9px',
                              fontSize: 12,
                              borderRadius: 6,
                              background: currentRole === 'admin' ? 'rgba(255, 213, 79, 0.15)' : 'var(--bg3)',
                              color: currentRole === 'admin' ? '#ffd54f' : 'var(--text1)',
                              border: currentRole === 'admin' ? '1px solid rgba(255, 213, 79, 0.4)' : '1px solid var(--border)',
                              fontWeight: currentRole === 'admin' ? 600 : 400,
                              cursor: 'pointer',
                            }}
                          >
                            <option value="member">👤 Member</option>
                            <option value="admin">👑 Group Admin</option>
                          </select>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.5 }}>
                <div>* Users can belong to multiple clubs. Their ratings and top 10 lists remain scoped to their respective clubs.</div>
                <div style={{ marginTop: 6, color: 'var(--text2)' }}>
                  👑 <strong>Group Admins</strong> can enter ratings, adjust rankings, and manage lists on behalf of any member during group watch sessions, but cannot see or access other clubs or the system admin console.
                </div>
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
                      onChange={e => {
                        setNewIsAdmin(e.target.checked);
                        if (e.target.checked) setNewIsGroupAdmin(false);
                      }}
                    />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13, color: '#fff' }}>Grant Site Administrator</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text2)' }}>Grants access to this Admin Console and group switching across all clubs.</div>
                    </div>
                  </label>
                </div>

                {!newIsAdmin && (
                  <div className="admin-form-group">
                    <label className="admin-checkbox-row">
                      <input
                        type="checkbox"
                        checked={newIsGroupAdmin}
                        onChange={e => setNewIsGroupAdmin(e.target.checked)}
                      />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13, color: '#ffd54f' }}>👑 Grant Group Admin for this Club</div>
                        <div style={{ fontSize: 11.5, color: 'var(--text2)' }}>Can enter ratings & manage lists for anyone during group watch sessions (cannot access other clubs or Admin console).</div>
                      </div>
                    </label>
                  </div>
                )}
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
