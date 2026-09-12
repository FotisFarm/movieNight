import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const DEFAULTS = {
  voters: ['Φώτης', 'Μητσέας', 'Παντελής', 'Στέλιας', 'Λεόντιος', 'Κλαίρη'],
  groupSize: 6,
  minVoters: 2,
  activeGroup: { id: 1, name: 'The Originals', slug: 'the-originals' },
  allVoters: ['Φώτης', 'Μητσέας', 'Παντελής', 'Στέλιας', 'Λεόντιος', 'Κλαίρη'],
  sandboxMode: false,
  sandboxVoter: '',
  hideHal: false,
};

const AppConfigContext = createContext({
  ...DEFAULTS,
  refreshConfig: () => Promise.resolve(),
});

export function AppConfigProvider({ children }) {
  const [config, setConfig] = useState(DEFAULTS);

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
    <AppConfigContext.Provider value={{ ...config, refreshConfig }}>
      {children}
    </AppConfigContext.Provider>
  );
}

export function useAppConfig() {
  return useContext(AppConfigContext);
}
