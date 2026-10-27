import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const DEFAULTS = {
  voters: ['Φώτης', 'Μητσέας', 'Παντελής', 'Στέλιας', 'Λεόντιος', 'Κλαίρη'],
  guestVoters: [],
  includeGuests: false,
  groupSize: 6,
  minVoters: 2,
  activeGroup: { id: 1, name: 'The Originals', slug: 'the-originals' },
  allVoters: ['Φώτης', 'Μητσέας', 'Παντελής', 'Στέλιας', 'Λεόντιος', 'Κλαίρη'],
  sandboxMode: false,
  sandboxVoter: '',
  hideHal: false,
  isAdmin: false,
  isSiteAdmin: false,
  isGroupAdmin: false,
};

const AppConfigContext = createContext({
  ...DEFAULTS,
  setIncludeGuests: () => {},
  toggleIncludeGuests: () => {},
  refreshConfig: () => Promise.resolve(),
});

export function AppConfigProvider({ children }) {
  const [config, setConfig] = useState(DEFAULTS);
  const [includeGuests, setIncludeGuestsState] = useState(() => {
    try {
      return localStorage.getItem('mn_include_guests') === 'true';
    } catch {
      return false;
    }
  });

  const currentVoter = typeof window !== 'undefined' ? sessionStorage.getItem('voter') : null;
  const isGuestUser = Boolean(
    config.guestVoters?.includes(currentVoter) ||
    config.activeGroup?.members?.some(m => (m.displayName === currentVoter || m.username === currentVoter) && m.role === 'guest')
  );
  const isSiteAdminUser = Boolean(
    config.isSiteAdmin ||
    config.isAdmin ||
    sessionStorage.getItem('isAdmin') === 'true' ||
    currentVoter === 'mnAdmin'
  );
  const isGroupAdminUser = Boolean(
    config.isGroupAdmin ||
    config.activeGroup?.members?.some(m => (m.displayName === currentVoter || m.username === currentVoter) && m.role === 'admin')
  );
  const canToggleGuests = !isGuestUser && (isSiteAdminUser || isGroupAdminUser);

  const setIncludeGuests = useCallback((val) => {
    if (!canToggleGuests) return;
    setIncludeGuestsState(prev => {
      const next = typeof val === 'function' ? val(prev) : Boolean(val);
      try {
        localStorage.setItem('mn_include_guests', String(next));
      } catch (_) {}
      fetch('/api/config/toggle-guests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ includeGuests: next })
      }).catch(() => {});
      return next;
    });
  }, [canToggleGuests]);

  const toggleIncludeGuests = useCallback(() => {
    if (!canToggleGuests) return;
    setIncludeGuests(prev => !prev);
  }, [canToggleGuests, setIncludeGuests]);

  const refreshConfig = useCallback(() => {
    return fetch('/api/config')
      .then(r => r.json())
      .then(d => {
        if (d) {
          setConfig(prev => ({ ...prev, ...d }));
          if (d.includeGuests !== undefined) {
            setIncludeGuestsState(Boolean(d.includeGuests));
            try {
              localStorage.setItem('mn_include_guests', String(Boolean(d.includeGuests)));
            } catch (_) {}
          }
        }
        return d;
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshConfig();
  }, [refreshConfig]);

  return (
    <AppConfigContext.Provider value={{
      ...config,
      includeGuests,
      canToggleGuests,
      setIncludeGuests,
      toggleIncludeGuests,
      refreshConfig
    }}>
      {children}
    </AppConfigContext.Provider>
  );
}

export function useAppConfig() {
  return useContext(AppConfigContext);
}
