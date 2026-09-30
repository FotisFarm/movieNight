import { useState, useRef } from 'react';
import { api } from '../api';
import UserAvatar from './UserAvatar';

// Curated SVG cinema avatar presets that work offline and look gorgeous
const CINEMA_PRESETS = [
  { id: 'slate', label: 'Clapperboard', url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="%231a1a24"/><path d="M15 35h70v45H15z" fill="%23252538" stroke="%23f5c518" stroke-width="3"/><path d="M15 20l70-5v15L15 35z" fill="%23e5a93c"/><path d="M28 19l8 13M48 17l8 14M68 15l8 15" stroke="%231a1a24" stroke-width="4"/><circle cx="50" cy="58" r="14" fill="%23f5c518"/><polygon points="46,50 60,58 46,66" fill="%231a1a24"/></svg>' },
  { id: 'reel', label: 'Film Reel', url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="%2312151c"/><circle cx="50" cy="50" r="38" fill="%23282c37" stroke="%23e5a93c" stroke-width="3"/><circle cx="50" cy="50" r="14" fill="%2312151c" stroke="%23e5a93c" stroke-width="3"/><circle cx="50" cy="24" r="8" fill="%23f5c518"/><circle cx="50" cy="76" r="8" fill="%23f5c518"/><circle cx="24" cy="50" r="8" fill="%23f5c518"/><circle cx="76" cy="50" r="8" fill="%23f5c518"/><circle cx="50" cy="50" r="4" fill="%23e5a93c"/></svg>' },
  { id: 'popcorn', label: 'Popcorn', url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="%23221b1b"/><path d="M28 42l8 45h28l8-45z" fill="%23d83a3a"/><path d="M38 42l4 45M50 42v45M62 42l-4 45" stroke="%23ffffff" stroke-width="4"/><circle cx="36" cy="34" r="10" fill="%23ffe89e"/><circle cx="48" cy="28" r="12" fill="%23fff2b2"/><circle cx="64" cy="34" r="10" fill="%23ffe89e"/><circle cx="56" cy="38" r="9" fill="%23f5c518"/><circle cx="42" cy="38" r="9" fill="%23f5c518"/></svg>' },
  { id: 'glasses', label: '3D Glasses', url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="%23141824"/><path d="M12 40h76v16H12z" fill="%23ffffff"/><rect x="18" y="44" width="28" height="24" rx="4" fill="%23e53935"/><rect x="54" y="44" width="28" height="24" rx="4" fill="%2300b0ff"/><path d="M12 44L5 32M88 44l7-12" stroke="%23ffffff" stroke-width="4" stroke-linecap="round"/></svg>' },
  { id: 'trophy', label: 'Oscar Gold', url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="%231e1a12"/><circle cx="50" cy="28" r="10" fill="%23f5c518"/><path d="M42 38h16l-3 30h-10z" fill="%23e5a93c"/><rect x="34" y="68" width="32" height="10" rx="2" fill="%23b8860b"/><rect x="30" y="78" width="40" height="8" rx="2" fill="%233a3224"/><path d="M38 42l-6 14 6 2M62 42l6 14-6 2" stroke="%23f5c518" stroke-width="3" fill="none"/></svg>' },
  { id: 'hal', label: 'HAL 9000', url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="%230c0c0e"/><rect x="25" y="10" width="50" height="80" rx="4" fill="%231c1d22" stroke="%23444" stroke-width="2"/><circle cx="50" cy="50" r="18" fill="%23000000" stroke="%23333" stroke-width="3"/><circle cx="50" cy="50" r="10" fill="%23ff1a1a"/><circle cx="50" cy="50" r="4" fill="%23ffff55"/></svg>' },
];

export default function ChangeAvatarModal({ currentAvatar = null, voter = '', onClose, onSaved }) {
  const [avatarUrl, setAvatarUrl] = useState(currentAvatar || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef(null);

  // Resize and compress chosen image file to max 256x256
  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX = 256;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX) {
            height = Math.round((height * MAX) / width);
            width = MAX;
          }
        } else {
          if (height > MAX) {
            width = Math.round((width * MAX) / height);
            height = MAX;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        setAvatarUrl(dataUrl);
        setError('');
      };
      img.onerror = () => {
        setError('Failed to process selected image.');
      };
      img.src = event.target?.result;
    };
    reader.readAsDataURL(file);
  }

  async function handleSave(e) {
    if (e) e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await api.updateAvatar(avatarUrl.trim() || null);
      setSuccess(true);
      if (onSaved) onSaved(res.avatarUrl);
      setTimeout(() => {
        onClose();
      }, 900);
    } catch (err) {
      setError(err.message || 'Failed to update profile picture.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1100 }}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420, padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Profile Picture</h3>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        {success ? (
          <div style={{ color: 'var(--green)', padding: '24px 0', textAlign: 'center', fontWeight: 600 }}>
            ✓ Profile picture updated!
          </div>
        ) : (
          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {error && <div style={{ color: 'var(--red)', fontSize: 12 }}>{error}</div>}

            {/* Avatar Preview */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <UserAvatar
                name={voter}
                avatarUrl={avatarUrl.trim() || null}
                size={84}
                style={{
                  border: '2.5px solid var(--accent)',
                  boxShadow: '0 4px 18px rgba(0, 0, 0, 0.45)',
                }}
              />
              <span style={{ fontSize: 12, color: 'var(--text2)', fontWeight: 600 }}>
                {voter}
              </span>
            </div>

            {/* Upload or Preset Buttons */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => fileInputRef.current?.click()}
              >
                📁 Choose File…
              </button>

              {avatarUrl && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ color: 'var(--red)' }}
                  onClick={() => setAvatarUrl('')}
                >
                  ✕ Remove
                </button>
              )}
            </div>

            {/* Image URL input */}
            <div>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>
                Or enter image URL:
              </label>
              <input
                type="url"
                className="input"
                placeholder="https://..."
                value={avatarUrl.startsWith('data:') ? '' : avatarUrl}
                onChange={e => {
                  setAvatarUrl(e.target.value);
                  setError('');
                }}
                style={{ width: '100%', boxSizing: 'border-box' }}
              />
            </div>

            {/* Cinema Presets */}
            <div>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--text2)', marginBottom: 6 }}>
                Or select a cinema preset:
              </label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                {CINEMA_PRESETS.map(preset => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      setAvatarUrl(preset.url);
                      setError('');
                    }}
                    title={preset.label}
                    style={{
                      padding: 2,
                      background: avatarUrl === preset.url ? 'var(--accent)' : 'var(--surface2)',
                      border: `1.5px solid ${avatarUrl === preset.url ? 'var(--gold)' : 'var(--border)'}`,
                      borderRadius: '50%',
                      cursor: 'pointer',
                      transition: 'transform 0.15s',
                    }}
                  >
                    <UserAvatar name={preset.label} avatarUrl={preset.url} size={36} />
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn btn-gold btn-sm" disabled={loading}>
                {loading ? 'Saving…' : 'Save Picture'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
