import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from './api';

const HalContext = createContext(null);

// Pull optional ```cards and ```suggestions JSON blocks out of an assistant reply.
export function parseHalReply(raw) {
  let text = String(raw || '').trim();
  let cards = null;
  let suggestions = null;

  const cardsMatch = text.match(/```cards\s*([\s\S]*?)```/i);
  if (cardsMatch) {
    try {
      const parsed = JSON.parse(cardsMatch[1].trim());
      if (Array.isArray(parsed) && parsed.length) cards = parsed;
    } catch {
      /* malformed block */
    }
    text = text.replace(cardsMatch[0], '').trim();
  }

  const suggMatch = text.match(/```suggestions\s*([\s\S]*?)```/i);
  if (suggMatch) {
    try {
      const parsed = JSON.parse(suggMatch[1].trim());
      if (Array.isArray(parsed) && parsed.length) suggestions = parsed;
    } catch {
      /* malformed block */
    }
    text = text.replace(suggMatch[0], '').trim();
  }

  return { text, cards, suggestions };
}

export function HalProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(
    () => localStorage.getItem('mn-hal-unlocked') === '1'
  );
  const [messages, setMessages] = useState([]);
  const [sending, setSending] = useState(false);
  const [modal, setModal] = useState(null); // { kind: 'movie', id } | { kind: 'dy', type, value }

  const unlockHal = useCallback(() => {
    setIsUnlocked(true);
    localStorage.setItem('mn-hal-unlocked', '1');
  }, []);

  const lockHal = useCallback(() => {
    setIsUnlocked(false);
    setIsOpen(false);
    localStorage.removeItem('mn-hal-unlocked');
  }, []);

  const openHal = useCallback(() => {
    unlockHal();
    setIsOpen(true);
  }, [unlockHal]);

  const closeHal = useCallback(() => {
    setIsOpen(false);
  }, []);

  const toggleHal = useCallback(() => {
    setIsOpen((prev) => {
      const next = !prev;
      if (next) unlockHal();
      return next;
    });
  }, [unlockHal]);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  const sendMessage = useCallback(
    async (text) => {
      const content = String(text || '').trim();
      if (!content || sending) return;

      const next = [...messages, { role: 'user', text: content }];
      setMessages(next);
      setSending(true);

      const history = next.map((m) => ({
        role: m.role,
        content: m.text,
      }));

      try {
        const res = await api.askChat(history);
        const { text: replyText, cards, suggestions } = parseHalReply(res?.reply);
        setMessages([
          ...next,
          {
            role: 'assistant',
            text: replyText,
            cards,
            suggestions,
            queries: res?.queries || [],
          },
        ]);
      } catch (err) {
        setMessages([
          ...next,
          {
            role: 'assistant',
            text: `⚠️ I encountered an issue: ${err.message}`,
          },
        ]);
      } finally {
        setSending(false);
      }
    },
    [messages, sending]
  );

  // Global hotkeys: Ctrl+K / Cmd+K or Ctrl+Shift+H to summon HAL
  useEffect(() => {
    function onKeyDown(e) {
      // Don't intercept Ctrl+K if user is inside a contentEditable or special editor,
      // but standard inputs can still open HAL via Ctrl+K command shortcut
      const isCmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k';
      const isCmdH = (e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'h';

      if (isCmdK || isCmdH) {
        e.preventDefault();
        toggleHal();
        return;
      }

      if (e.key === 'Escape') {
        // If a movie or director/year modal is open, let that handle escape first
        if (modal) {
          setModal(null);
          return;
        }
        if (isOpen) {
          closeHal();
        }
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, modal, toggleHal, closeHal]);

  // URL query parameter unlock check: ?hal=1 or ?hal=true
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('hal') === '1' || params.get('hal') === 'true') {
        openHal();
        params.delete('hal');
        const newSearch = params.toString();
        const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : '') + window.location.hash;
        window.history.replaceState(null, '', newUrl);
      }
    } catch {
      // ignore in non-browser envs
    }
  }, [openHal]);

  return (
    <HalContext.Provider
      value={{
        isOpen,
        isUnlocked,
        openHal,
        closeHal,
        toggleHal,
        unlockHal,
        lockHal,
        messages,
        sending,
        sendMessage,
        clearMessages,
        modal,
        setModal,
      }}
    >
      {children}
    </HalContext.Provider>
  );
}

export function useHal() {
  return useContext(HalContext);
}
