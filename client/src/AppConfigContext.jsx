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

  const setIncludeGuests = useCallback((val) => {
    setIncludeGuestsState(prev => {
      const next = typeof val === 'function' ? val(prev) : Boolean(val);
      try {
        localStorage.setItem('mn_include_guests', String(next));
      } catch (_) {}
      return next;
    });
  }, []);

  const toggleIncludeGuests = useCallback(() => {
    setIncludeGuests(prev => !prev);
  }, [setIncludeGuests]);

  const refreshConfig = useCallback(() => {
    return fetch('/api/config')
      .then(r => r.json())
      .then(d => {
        setConfig(prev => ({ ...prev, ...d }));
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
