import { useState, useRef, useEffect } from 'react';
import { api } from '../api';
import { fmt, scoreClass } from '../utils';
import MovieModal from '../components/MovieModal';
import './Chat.css';

const EXAMPLES = [
  'Which director do we rate highest (min 3 films)?',
  'Show me our 5 most controversial films',
  'Best films of the 1990s',
  'What should I watch from the watchlist?',
];

// Pull an optional ```cards JSON block out of a reply. Returns { text, cards }.
function parseReply(raw) {
  const m = String(raw || '').match(/```cards\s*([\s\S]*?)```/i);
  if (!m) return { text: String(raw || '').trim(), cards: null };
  let cards = null;
  try {
    const parsed = JSON.parse(m[1].trim());
    if (Array.isArray(parsed) && parsed.length) cards = parsed;
  } catch { /* malformed block — fall back to text only */ }
  return { text: raw.replace(m[0], '').trim(), cards };
}

function HalCards({ cards, onOpenMovie }) {
  return (
    <div className="hal-cards">
      {cards.map((c, i) => {
        const clickable = c.type === 'movie' && c.id != null;
        return (
          <div
            key={i}
            className={`hal-card${clickable ? ' hal-card-click' : ''}`}
            onClick={clickable ? () => onOpenMovie(c.id) : undefined}
            role={clickable ? 'button' : undefined}
          >
            <div className="hal-card-label">{c.type}</div>
            <div className="hal-card-title">{c.title}</div>
            {c.meta && <div className="hal-card-meta">{c.meta}</div>}
            {c.score != null && (
              <div className={`hal-card-score ${scoreClass(c.score)}`}>
                {fmt(c.score)}
                {c.scoreLabel && <span className="hal-card-score-lbl"> {c.scoreLabel}</span>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function Chat({ voter }) {
  const [messages, setMessages] = useState([]); // { role, text, cards? }
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [modalId, setModalId] = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  async function send(text) {
    const content = (text ?? input).trim();
    if (!content || sending) return;

    const next = [...messages, { role: 'user', text: content }];
    setMessages(next);
    setInput('');
    setSending(true);
    // The API expects role/content string messages — flatten our display shape.
    const history = next.map((m) => ({ role: m.role, content: m.text }));
    try {
      const { reply } = await api.askChat(history);
      const { text: replyText, cards } = parseReply(reply);
      setMessages([...next, { role: 'assistant', text: replyText, cards }]);
    } catch (err) {
      setMessages([...next, { role: 'assistant', text: `⚠️ ${err.message}` }]);
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="chat-page">
      <div className="chat-header">
        <h1 className="chat-title">HAL 9000</h1>
        <p className="chat-sub">Ask anything about the films, ratings, and rankings · read-only</p>
      </div>

      <div className="chat-window" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="chat-empty">
            <div className="chat-empty-icon">🔴</div>
            <p className="chat-empty-text">
              {voter ? `Good evening, ${voter}. ` : ''}Ask me about the group's films. Try one of these:
            </p>
            <div className="chat-examples">
              {EXAMPLES.map((q) => (
                <button key={q} className="chat-example" onClick={() => send(q)} disabled={sending}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={`chat-msg chat-msg-${m.role}`}>
              <div className="chat-msg-inner">
                {m.text && <div className="chat-bubble">{m.text}</div>}
                {m.cards && <HalCards cards={m.cards} onOpenMovie={setModalId} />}
              </div>
            </div>
          ))
        )}
        {sending && (
          <div className="chat-msg chat-msg-assistant">
            <div className="chat-bubble chat-bubble-typing">
              <span className="chat-dot" />
              <span className="chat-dot" />
              <span className="chat-dot" />
            </div>
          </div>
        )}
      </div>

      <div className="chat-input-row">
        <textarea
          className="input chat-input"
          rows={1}
          placeholder="Ask about the films…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={sending}
        />
        <button className="btn chat-send" onClick={() => send()} disabled={sending || !input.trim()}>
          Send
        </button>
      </div>

      {modalId != null && (
        <MovieModal movieId={modalId} onClose={() => setModalId(null)} onSaved={() => setModalId(null)} />
      )}
    </div>
  );
}
