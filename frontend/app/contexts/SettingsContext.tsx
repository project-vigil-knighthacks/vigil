'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';

export interface Settings {
  // Connection
  apiBaseUrl: string;
  pollingInterval: number;
  autoReconnect: boolean;
  connectionTimeout: number;
  // Notifications
  toastsEnabled: boolean;
  alertOnCritical: boolean;
  // Display
  rowSpacing: 'tight' | 'standard' | 'relaxed';
  timestampFormat: 'iso' | 'relative' | 'local';
  hiddenLogAttributes: string[];
  // Profile
  username: string;
  role: 'administrator' | 'analyst' | 'readonly';
}

export const DEFAULT_SETTINGS: Settings = {
  apiBaseUrl: '',
  pollingInterval: 30,
  autoReconnect: true,
  connectionTimeout: 5000,
  toastsEnabled: true,
  alertOnCritical: true,
  rowSpacing: 'standard',
  timestampFormat: 'iso',
  hiddenLogAttributes: [],
  username: 'admin',
  role: 'administrator',
};

const ROW_SPACING_MAP: Record<Settings['rowSpacing'], string> = {
  tight:    '0.25rem 0.75rem',
  standard: '0.5rem 0.75rem',
  relaxed:  '0.875rem 0.75rem',
};

const STORAGE_KEY = 'vigil_settings';

interface SettingsContextValue {
  settings: Settings;
  staged: Settings;
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  save: () => void;
  reset: () => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

function loadFromStorage(): Settings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function applyRowSpacing(rowSpacing: Settings['rowSpacing']) {
  document.body.style.setProperty(
    '--table-row-padding',
    ROW_SPACING_MAP[rowSpacing]
  );
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [committed, setCommitted] = useState<Settings>(DEFAULT_SETTINGS);
  const [staged, setStaged] = useState<Settings>(DEFAULT_SETTINGS);

  useEffect(() => {
    const loaded = loadFromStorage();
    setCommitted(loaded);
    setStaged(loaded);
    applyRowSpacing(loaded.rowSpacing);
  }, []);

  const setSetting = useCallback(
    <K extends keyof Settings>(key: K, value: Settings[K]) => {
      setStaged((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const save = useCallback(() => {
    setCommitted(staged);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(staged));
    applyRowSpacing(staged.rowSpacing);
  }, [staged]);

  const reset = useCallback(() => {
    setStaged(DEFAULT_SETTINGS);
  }, []);

  return (
    <SettingsContext.Provider value={{ settings: committed, staged, setSetting, save, reset }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
