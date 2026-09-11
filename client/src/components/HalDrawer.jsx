import React, { useState, useRef, useEffect } from 'react';
import { useHal } from '../HalContext';
import HalEye from './HalEye';
import MovieModal from './MovieModal';
import DirectorYearModal from './DirectorYearModal';
import { fmt, scoreClass } from '../utils';
import './HalDrawer.css';

const SUGGESTIONS = [
  'Which director do we rate highest (min 3 films)?',
  'Show me our 5 most controversial films',
  'What should I watch from the watchlist?',
  'Best films of the 1990s',
  'Which films have all 5 of us rated?',
];

function cardTarget(c) {
  if (c.type === 'movie') return c.id != null ? { kind: 'movie', id: c.id } : null;
  if (c.type === 'director') {
    const value = c.value ?? c.title;
    return value ? { kind: 'dy', type: 'director', value: String(value) } : null;
  }
  if (c.type === 'year') {
    const value = c.value ?? c.title;
    return value != null ? { kind: 'dy', type: 'year', value: String(value) } : null;
  }
  if (c.type === 'decade') {
    const value = parseInt(c.value ?? c.title, 10);
    return Number.isNaN(value) ? null : { kind: 'dy', type: 'decade', value };
  }
  return null;
}

function formatInline(text) {
  const parts = [];
  let remaining = text;
  let key = 0;
  const regex = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`)/;

  while (remaining) {
    const match = remaining.match(regex);
    if (!match) {
      parts.push(remaining);
      break;
    }
    const idx = match.index;
    if (idx > 0) {
      parts.push(remaining.slice(0, idx));
    }
    const full = match[0];
    if (full.startsWith('**')) {
      parts.push(<strong key={key++} className="hal-text-bold">{match[2]}</strong>);
    } else if (full.startsWith('*')) {
      parts.push(<em key={key++} className="hal-text-italic">{match[3]}</em>);
    } else if (full.startsWith('`')) {
      parts.push(<code key={key++} className="hal-code-inline">{match[4]}</code>);
    }
    remaining = remaining.slice(idx + full.length);
  }
  return parts;
}

function HalFormattedText({ content }) {
  if (!content) return null;
  const paragraphs = content.split(/\n\n+/);

  return (
    <div className="hal-prose">
      {paragraphs.map((p, i) => {
        const lines = p.split('\n');
        return (
          <p key={i} className="hal-prose-p">
            {lines.map((line, li) => (
              <React.Fragment key={li}>
                {li > 0 && <br />}
                {formatInline(line)}
              </React.Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

function HalCardsList({ cards, onOpen }) {
  if (!cards || !cards.length) return null;

  return (
    <div className="hal-drawer-cards">
      {cards.map((c, i) => {
        const target = cardTarget(c);
        return (
          <div
            key={i}
            className={`hal-drawer-card ${target ? 'hal-drawer-card-clickable' : ''}`}
            onClick={target ? () => onOpen(target) : undefined}
            role={target ? 'button' : undefined}
            tabIndex={target ? 0 : undefined}
            onKeyDown={target ? (e) => e.key === 'Enter' && onOpen(target) : undefined}
          >
            <div className="hal-drawer-card-header">
              <span className="hal-drawer-card-type">{c.type}</span>
              {c.score != null && (
                <span className={`hal-drawer-card-score ${scoreClass(c.score)}`}>
                  {fmt(c.score)}
                  {c.scoreLabel && <span className="hal-drawer-card-score-lbl"> {c.scoreLabel}</span>}
                </span>
              )}
            </div>
            <div className="hal-drawer-card-title">{c.title}</div>
            {c.meta && <div className="hal-drawer-card-meta">{c.meta}</div>}
          </div>
        );
      })}
    </div>
  );
}

export default function HalDrawer({ voter }) {
  const {
    isOpen,
    closeHal,
    lockHal,
    messages,
    sending,
    sendMessage,
    clearMessages,
    modal,
    setModal,
  } = useHal();

  const [input, setInput] = useState('');
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  // Auto scroll to bottom on message change or sending state
  useEffect(() => {
    if (isOpen) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, sending, isOpen]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const currentVoter = voter || sessionStorage.getItem('voter') || '';

  const handleSend = (text) => {
    const q = text ?? input;
    if (!q.trim() || sending) return;
    sendMessage(q);
    setInput('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      <div className="hal-drawer-backdrop" onClick={closeHal} aria-label="Close HAL assistant" />
      <aside className="hal-drawer-panel" aria-label="HAL 9000 Assistant">
        {/* Header */}
        <div className="hal-drawer-header">
          <div className="hal-drawer-brand">
            <HalEye size={24} active={sending} />
            <div className="hal-drawer-title-group">
              <div className="hal-drawer-title-row">
                <span className="hal-drawer-title">HAL 9000</span>
                <span className="hal-drawer-badge">Gemini 3.6 Flash</span>
              </div>
              <span className="hal-drawer-subtitle">Onboard Heuristic Computer · Read-Only</span>
            </div>
          </div>

          <div className="hal-drawer-actions">
            <button
              type="button"
              className="hal-drawer-icon-btn"
              onClick={clearMessages}
              title="Clear conversation"
              aria-label="Clear conversation"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
            <button
              type="button"
              className="hal-drawer-icon-btn hal-drawer-lock-btn"
              onClick={() => {
                if (window.confirm('Hide HAL from the header? You can summon HAL anytime by pressing Ctrl+K.')) {
                  lockHal();
                }
              }}
              title="Hide HAL from header (Ctrl+K still works)"
              aria-label="Hide HAL from header"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </button>
            <button
              type="button"
              className="hal-drawer-icon-btn hal-drawer-close-btn"
              onClick={closeHal}
              title="Close (Esc)"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Message window */}
        <div className="hal-drawer-body" ref={scrollRef}>
          {messages.length === 0 ? (
            <div className="hal-drawer-welcome">
              <div className="hal-drawer-hero-eye">
                <HalEye size={64} active={false} />
              </div>
              <h2 className="hal-welcome-title">
                {currentVoter ? `Good evening, ${currentVoter}.` : 'Good evening.'}
              </h2>
              <p className="hal-welcome-desc">
                I am a HAL 9000 computer. I am completely operational, and all my circuits are functioning perfectly. Ask me anything about the group’s films, ratings, and statistics.
              </p>

              <div className="hal-drawer-suggestions">
                <span className="hal-suggestions-label">Try asking:</span>
                {SUGGESTIONS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    className="hal-suggestion-chip"
                    onClick={() => handleSend(q)}
                    disabled={sending}
                  >
                    <span>{q}</span>
                    <span className="hal-suggestion-arrow">→</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="hal-messages-list">
              {messages.map((m, i) => (
                <div key={i} className={`hal-msg hal-msg-${m.role}`}>
                  {m.role === 'assistant' && (
                    <div className="hal-msg-avatar">
                      <HalEye size={18} />
                    </div>
                  )}
                  <div className="hal-msg-content">
                    {m.text && (
                      <div className="hal-msg-bubble">
                        <HalFormattedText content={m.text} />
                      </div>
                    )}
                    {m.cards && <HalCardsList cards={m.cards} onOpen={setModal} />}
                  </div>
                </div>
              ))}

              {sending && (
                <div className="hal-msg hal-msg-assistant">
                  <div className="hal-msg-avatar">
                    <HalEye size={18} active={true} />
                  </div>
                  <div className="hal-msg-content">
                    <div className="hal-msg-bubble hal-typing-bubble">
                      <span className="hal-typing-dot" />
                      <span className="hal-typing-dot" />
                      <span className="hal-typing-dot" />
                      <span className="hal-typing-text">Analyzing film database…</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Input */}
        <div className="hal-drawer-footer">
          <div className="hal-input-wrapper">
            <textarea
              ref={inputRef}
              className="hal-drawer-input"
              rows={1}
              placeholder="Ask HAL anything about the films…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={sending}
            />
            <button
              type="button"
              className="hal-drawer-send-btn"
              onClick={() => handleSend()}
              disabled={sending || !input.trim()}
              title="Send (Enter)"
              aria-label="Send message"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
          <div className="hal-footer-hint">
            <span>Press <kbd>Ctrl+K</kbd> anywhere to toggle</span>
            <span className="hal-hint-dot">·</span>
            <span><kbd>Esc</kbd> to close</span>
          </div>
        </div>
      </aside>

      {/* Modal overlays for card clicks */}
      {modal?.kind === 'movie' && (
        <MovieModal movieId={modal.id} onClose={() => setModal(null)} onSaved={() => setModal(null)} />
      )}
      {modal?.kind === 'dy' && (
        <DirectorYearModal type={modal.type} value={modal.value} onClose={() => setModal(null)} />
      )}
    </>
  );
}
