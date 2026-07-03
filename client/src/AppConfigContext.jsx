import { createContext, useContext, useState, useEffect } from 'react';

const DEFAULTS = {
  voters: ['Μητσέας', 'Παντελής', 'Στέλιας', 'Φώτης', 'Λεόντιος'],
  groupSize: 5,
  minVoters: 2,
};

const AppConfigContext = createContext(DEFAULTS);

export function AppConfigProvider({ children }) {
  const [config, setConfig] = useState(DEFAULTS);

  useEffect(() => {
    fetch('/api/config')
      .then(r => r.json())
      .then(setConfig)
      .catch(() => {}); // keep defaults on failure
  }, []);

  return (
    <AppConfigContext.Provider value={config}>
      {children}
    </AppConfigContext.Provider>
  );
}

export function useAppConfig() {
  return useContext(AppConfigContext);
}
