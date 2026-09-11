import React, { useState, useRef, useEffect } from 'react';
import { useHal } from '../HalContext';
import HalEye from '../components/HalEye';
import MovieModal from '../components/MovieModal';
import DirectorYearModal from '../components/DirectorYearModal';
import { fmt, scoreClass } from '../utils';
import './Chat.css';

const EXAMPLES = [
  'Which director do we rate highest (min 3 films)?',
  'Show me our 5 most controversial films',
  'Best films of the 1990s',
  'What should I watch from the watchlist?',
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

function HalCards({ cards, onOpen }) {
  return (
    <div className="hal-cards">
      {cards.map((c, i) => {
        const target = cardTarget(c);
        return (
          <div
            key={i}
            className={`hal-card${target ? ' hal-card-click' : ''}`}
            onClick={target ? () => onOpen(target) : undefined}
            role={target ? 'button' : undefined}
            tabIndex={target ? 0 : undefined}
            onKeyDown={target ? (e) => e.key === 'Enter' && onOpen(target) : undefined}
          >
            <div className="hal-card-top">
              <span className="hal-card-label">{c.type}</span>
              {c.score != null && (
                <div className={`hal-card-score ${scoreClass(c.score)}`}>
                  {fmt(c.score)}
                  {c.scoreLabel && <span className="hal-card-score-lbl"> {c.scoreLabel}</span>}
                </div>
              )}
            </div>
            <div className="hal-card-title">{c.title}</div>
            {c.meta && <div className="hal-card-meta">{c.meta}</div>}
          </div>
        );
      })}
    </div>
  );
}

export default function Chat({ voter }) {
  const {
    unlockHal,
    messages,
    sending,
    sendMessage,
    clearMessages,
    modal,
    setModal,
    openHal,
  } = useHal();

  const [input, setInput] = useState('');
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  // Navigating to /chat unlocks HAL
  useEffect(() => {
    unlockHal();
  }, [unlockHal]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  const handleSend = (text) => {
    const q = text ?? input;
    if (!q.trim() || sending) return;
    sendMessage(q);
    setInput('');
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="chat-page">
      <div className="chat-header">
        <div className="chat-header-main">
          <HalEye size={36} active={sending} />
          <div>
            <div className="chat-title-row">
              <h1 className="chat-title">HAL 9000</h1>
              <span className="chat-badge">Gemini 2.5 Flash</span>
            </div>
            <p className="chat-sub">Ask anything about the films, ratings, and rankings · read-only</p>
          </div>
        </div>

        <div className="chat-header-actions">
          {messages.length > 0 && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={clearMessages}
              title="Clear conversation"
            >
              Clear
            </button>
          )}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={openHal}
            title="Open in floating slide-over drawer"
          >
            Floating Console (Ctrl+K)
          </button>
        </div>
      </div>

      <div className="chat-window" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="chat-empty">
            <div className="chat-empty-icon">
              <HalEye size={64} active={false} />
            </div>
            <h2 className="chat-empty-greeting">
              {voter ? `Good evening, ${voter}.` : 'Good evening.'}
            </h2>
            <p className="chat-empty-text">
              I am a HAL 9000 computer. I am completely operational, and all my circuits are functioning perfectly. Ask me anything about the group's film catalogue:
            </p>
            <div className="chat-examples">
              {EXAMPLES.map((q) => (
                <button
                  key={q}
                  type="button"
                  className="chat-example"
                  onClick={() => handleSend(q)}
                  disabled={sending}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={`chat-msg chat-msg-${m.role}`}>
              {m.role === 'assistant' && (
                <div className="chat-avatar">
                  <HalEye size={20} />
                </div>
              )}
              <div className="chat-msg-inner">
                {m.text && (
                  <div className="chat-bubble">
                    <HalFormattedText content={m.text} />
                  </div>
                )}
                {m.cards && <HalCards cards={m.cards} onOpen={setModal} />}
              </div>
            </div>
          ))
        )}
        {sending && (
          <div className="chat-msg chat-msg-assistant">
            <div className="chat-avatar">
              <HalEye size={20} active={true} />
            </div>
            <div className="chat-msg-inner">
              <div className="chat-bubble chat-bubble-typing">
                <span className="chat-dot" />
                <span className="chat-dot" />
                <span className="chat-dot" />
                <span className="chat-typing-status">Analyzing film database…</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="chat-input-row">
        <textarea
          ref={inputRef}
          className="input chat-input"
          rows={1}
          placeholder="Ask HAL about the films (e.g. 'Which director do we rate highest?')"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={sending}
        />
        <button
          type="button"
          className="btn chat-send"
          onClick={() => handleSend()}
          disabled={sending || !input.trim()}
        >
          Send
        </button>
      </div>

      {modal?.kind === 'movie' && (
        <MovieModal movieId={modal.id} onClose={() => setModal(null)} onSaved={() => setModal(null)} />
      )}
      {modal?.kind === 'dy' && (
        <DirectorYearModal type={modal.type} value={modal.value} onClose={() => setModal(null)} />
      )}
    </div>
  );
}
