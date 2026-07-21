import { useState, useRef, useEffect } from 'react';
import { api } from '../api';
import './Chat.css';

const EXAMPLES = [
  'Which director do we rate highest (min 3 films)?',
  'How many films have all voters rated?',
  'What are our most controversial films?',
  'What should I watch from the watchlist?',
];

export default function Chat({ voter }) {
  const [messages, setMessages] = useState([]); // { role: 'user' | 'assistant', content }
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  async function send(text) {
    const content = (text ?? input).trim();
    if (!content || sending) return;

    const next = [...messages, { role: 'user', content }];
    setMessages(next);
    setInput('');
    setSending(true);
    try {
      const { reply } = await api.askChat(next);
      setMessages([...next, { role: 'assistant', content: reply }]);
    } catch (err) {
      setMessages([...next, { role: 'assistant', content: `⚠️ ${err.message}` }]);
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
        <h1 className="chat-title">Ask the Archive</h1>
        <p className="chat-sub">Ask anything about the films, ratings, and rankings · read-only</p>
      </div>

      <div className="chat-window" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="chat-empty">
            <div className="chat-empty-icon">💬</div>
            <p className="chat-empty-text">
              {voter ? `Hi ${voter} — ` : ''}ask me about the group's films. Try one of these:
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
              <div className="chat-bubble">{m.content}</div>
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
    </div>
  );
}
