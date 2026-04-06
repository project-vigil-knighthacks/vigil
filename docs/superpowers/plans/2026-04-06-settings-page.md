# Settings Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working `/settings` page with four tabs (Connection, Notifications, Display, Profile), backed by a `localStorage`-persisted context available app-wide.

**Architecture:** A `SettingsContext` holds staged settings state and syncs to `localStorage` on save. `SettingsProvider` wraps the app in `layout.tsx`. The settings page is a left-tab panel component that reads/writes via `useSettings()`. Row spacing applies a CSS variable to `<body>` so all tables pick it up automatically.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, CSS Modules (`siem.module.css`), `localStorage`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `frontend/app/contexts/SettingsContext.tsx` | Create | Settings type, defaults, provider, hook |
| `frontend/app/settings/page.tsx` | Create | Settings page UI — tabs, fields, save/reset |
| `frontend/app/layout.tsx` | Modify | Wrap children with `SettingsProvider` |
| `frontend/app/components/Sidebar.tsx` | Modify | Add Settings nav item; wire settings icon button to router |
| `frontend/app/components/Toast.tsx` | Modify | No-op `toast()` when `toastsEnabled` is false |
| `frontend/app/siem.module.css` | Modify | Add settings page CSS; change `logTable td` padding to use CSS var |

---

## Task 1: SettingsContext

**Files:**
- Create: `frontend/app/contexts/SettingsContext.tsx`

- [ ] **Step 1: Create the context file**

```tsx
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
  // Profile
  username: string;
  role: 'administrator' | 'analyst' | 'readonly';
}

export const DEFAULT_SETTINGS: Settings = {
  apiBaseUrl: 'http://localhost:8000',
  pollingInterval: 30,
  autoReconnect: true,
  connectionTimeout: 5000,
  toastsEnabled: true,
  alertOnCritical: true,
  rowSpacing: 'standard',
  timestampFormat: 'iso',
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
```

- [ ] **Step 2: Commit**

```bash
cd frontend
git add app/contexts/SettingsContext.tsx
git commit -m "feat: add SettingsContext with localStorage persistence"
```

---

## Task 2: Wire SettingsProvider into layout

**Files:**
- Modify: `frontend/app/layout.tsx`

- [ ] **Step 1: Add SettingsProvider import and wrap children**

Current `layout.tsx` body:
```tsx
import { ToastProvider } from "./components/Toast";
```

Add below it:
```tsx
import { SettingsProvider } from "./contexts/SettingsContext";
```

Change:
```tsx
<ToastProvider>{children}</ToastProvider>
```
To:
```tsx
<SettingsProvider>
  <ToastProvider>{children}</ToastProvider>
</SettingsProvider>
```

- [ ] **Step 2: Commit**

```bash
git add app/layout.tsx
git commit -m "feat: wrap app with SettingsProvider"
```

---

## Task 3: Respect `toastsEnabled` in Toast

**Files:**
- Modify: `frontend/app/components/Toast.tsx`

The `ToastProvider` lives inside `SettingsProvider`, so it can read settings.

- [ ] **Step 1: Import `useSettings` and no-op `toast` when disabled**

Add import at top of `Toast.tsx`:
```tsx
import { useSettings } from '../contexts/SettingsContext';
```

Inside `ToastProvider`, add after the `counter` ref:
```tsx
const { settings } = useSettings();
```

Change the `toast` callback from:
```tsx
const toast = useCallback((type: ToastType, title: string, message?: string) => {
  const id = ++counter.current;
  setToasts((prev) => [...prev, { id, type, title, message, time: getTime() }]);
  setTimeout(() => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, DURATION);
}, []);
```
To:
```tsx
const toast = useCallback((type: ToastType, title: string, message?: string) => {
  if (!settings.toastsEnabled) return;
  const id = ++counter.current;
  setToasts((prev) => [...prev, { id, type, title, message, time: getTime() }]);
  setTimeout(() => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, DURATION);
}, [settings.toastsEnabled]);
```

- [ ] **Step 2: Commit**

```bash
git add app/components/Toast.tsx
git commit -m "feat: respect toastsEnabled setting in Toast"
```

---

## Task 4: Update Sidebar nav + settings icon

**Files:**
- Modify: `frontend/app/components/Sidebar.tsx`

- [ ] **Step 1: Add Settings to navItems**

In `Sidebar.tsx`, change:
```tsx
const navItems = [
  { href: '/',        label: 'Log Parser', icon: 'terminal' },
  { href: '/events',  label: 'Events',     icon: 'event_note' },
  { href: '/alerts',  label: 'Alerts',     icon: 'notification_important' },
  { href: '/health',  label: 'Health',     icon: 'monitor_heart' },
];
```
To:
```tsx
const navItems = [
  { href: '/',         label: 'Log Parser', icon: 'terminal' },
  { href: '/events',   label: 'Events',     icon: 'event_note' },
  { href: '/alerts',   label: 'Alerts',     icon: 'notification_important' },
  { href: '/health',   label: 'Health',     icon: 'monitor_heart' },
  { href: '/settings', label: 'Settings',   icon: 'settings' },
];
```

Also add to `routeLabels`:
```tsx
'/settings': '/settings',
```

- [ ] **Step 2: Wire settings icon button to router**

Add `useRouter` import:
```tsx
import { usePathname, useRouter } from 'next/navigation';
```

Add inside `Sidebar` component body (after `const { toast } = useToast();`):
```tsx
const router = useRouter();
```

Change the settings button from:
```tsx
<button
  className={`material-symbols-outlined ${styles.topBarIconBtn}`}
  onClick={() => toast('warning', 'Settings not yet implemented')}
  aria-label="Settings"
>settings</button>
```
To:
```tsx
<button
  className={`material-symbols-outlined ${styles.topBarIconBtn}`}
  onClick={() => router.push('/settings')}
  aria-label="Settings"
>settings</button>
```

- [ ] **Step 3: Commit**

```bash
git add app/components/Sidebar.tsx
git commit -m "feat: add Settings to sidebar nav, wire settings icon to /settings"
```

---

## Task 5: Add `--table-row-padding` to logTable CSS

**Files:**
- Modify: `frontend/app/siem.module.css`

- [ ] **Step 1: Change `logTable td` and `logTable th` padding to use CSS variable**

Find in `siem.module.css`:
```css
.logTable th {
  padding: 0.75rem 1.5rem;
```
Change to:
```css
.logTable th {
  padding: var(--table-row-padding, 0.5rem 0.75rem);
```

Find:
```css
.logTable td {
  padding: 0.75rem 1.5rem;
```
Change to:
```css
.logTable td {
  padding: var(--table-row-padding, 0.5rem 0.75rem);
```

- [ ] **Step 2: Commit**

```bash
git add app/siem.module.css
git commit -m "feat: use --table-row-padding CSS var in logTable"
```

---

## Task 6: Settings page CSS

**Files:**
- Modify: `frontend/app/siem.module.css`

- [ ] **Step 1: Append settings page styles to end of `siem.module.css`**

```css
/* ============================================================
   Settings Page
   ============================================================ */

.settingsPage {
  display: flex;
  flex: 1;
  overflow: hidden;
  height: calc(100vh - 48px);
}

/* Left tab nav */
.settingsTabs {
  width: 180px;
  flex-shrink: 0;
  border-right: 1px solid rgba(53, 53, 52, 0.5);
  padding: 1.25rem 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.settingsTabHeader {
  padding: 0 1rem 0.75rem;
  font-family: var(--font-geist-mono, monospace);
  font-size: 0.5rem;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: rgba(229, 226, 225, 0.25);
}

.settingsTab {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.625rem 1rem;
  font-size: 0.8rem;
  font-family: var(--font-geist-mono, monospace);
  color: rgba(229, 226, 225, 0.45);
  cursor: pointer;
  border: none;
  border-left: 2px solid transparent;
  background: none;
  text-align: left;
  width: 100%;
  transition: color 0.15s, background-color 0.15s;
}

.settingsTab:hover {
  color: #e5e2e1;
  background: rgba(255, 255, 255, 0.03);
}

.settingsTabActive {
  color: #e5e2e1;
  border-left-color: #e63946;
  background: rgba(230, 57, 70, 0.05);
}

.settingsTabIcon {
  font-family: 'Material Symbols Outlined';
  font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
  font-size: 0.9rem;
  line-height: 1;
  flex-shrink: 0;
}

/* Content pane */
.settingsContent {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem 2rem 2rem;
}

.settingsSectionTitle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-family: var(--font-geist-mono, monospace);
  font-size: 0.625rem;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: rgba(229, 226, 225, 0.3);
  margin-bottom: 0.25rem;
}

.settingsSectionTitle::after {
  content: '';
  flex: 1;
  height: 1px;
  background: rgba(53, 53, 52, 0.5);
}

.settingsRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.875rem 0;
  border-bottom: 1px solid rgba(53, 53, 52, 0.3);
  gap: 2rem;
}

.settingsRowLabel {
  font-size: 0.8125rem;
  font-weight: 600;
  color: #e5e2e1;
}

.settingsRowDesc {
  font-family: var(--font-geist-mono, monospace);
  font-size: 0.625rem;
  color: rgba(229, 226, 225, 0.35);
  margin-top: 0.2rem;
}

/* Text / number inputs */
.settingsInput {
  background: #0e0e0e;
  border: 1px solid rgba(53, 53, 52, 0.8);
  color: rgba(229, 226, 225, 0.8);
  font-family: var(--font-geist-mono, monospace);
  font-size: 0.6875rem;
  padding: 0.375rem 0.625rem;
  width: 240px;
  outline: none;
  transition: border-color 0.15s;
}

.settingsInput:focus {
  border-color: rgba(230, 57, 70, 0.5);
}

.settingsInputError {
  border-color: #e63946 !important;
}

/* Select */
.settingsSelect {
  background: #0e0e0e;
  border: 1px solid rgba(53, 53, 52, 0.8);
  color: rgba(229, 226, 225, 0.8);
  font-family: var(--font-geist-mono, monospace);
  font-size: 0.6875rem;
  padding: 0.375rem 0.625rem;
  width: 180px;
  outline: none;
  cursor: pointer;
  transition: border-color 0.15s;
}

.settingsSelect:focus {
  border-color: rgba(230, 57, 70, 0.5);
}

/* Toggle */
.settingsToggle {
  position: relative;
  width: 36px;
  height: 18px;
  flex-shrink: 0;
  cursor: pointer;
}

.settingsToggle input {
  opacity: 0;
  width: 0;
  height: 0;
  position: absolute;
}

.settingsToggleTrack {
  position: absolute;
  inset: 0;
  background: rgba(53, 53, 52, 0.8);
  border-radius: 9px;
  transition: background 0.2s;
}

.settingsToggle input:checked + .settingsToggleTrack {
  background: #e63946;
}

.settingsToggleThumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  background: #fff;
  border-radius: 50%;
  transition: transform 0.2s;
  pointer-events: none;
}

.settingsToggle input:checked ~ .settingsToggleThumb {
  transform: translateX(18px);
}

/* Row spacing segmented picker */
.segPicker {
  display: flex;
  border: 1px solid rgba(53, 53, 52, 0.8);
  overflow: hidden;
  flex-shrink: 0;
}

.segOption {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1rem;
  cursor: pointer;
  background: #0e0e0e;
  border: none;
  border-right: 1px solid rgba(53, 53, 52, 0.6);
  min-width: 80px;
  transition: background 0.15s;
  color: rgba(229, 226, 225, 0.4);
}

.segOption:last-child {
  border-right: none;
}

.segOption:hover {
  background: #1a1a1a;
}

.segOptionActive {
  background: rgba(230, 57, 70, 0.08);
  box-shadow: inset 0 -2px 0 #e63946;
  color: #e63946;
}

.segPreview {
  display: flex;
  flex-direction: column;
  width: 44px;
}

.segPreviewRow {
  background: rgba(229, 226, 225, 0.15);
  border-bottom: 1px solid rgba(53, 53, 52, 0.4);
}

.segOptionActive .segPreviewRow {
  background: rgba(230, 57, 70, 0.25);
  border-bottom-color: rgba(230, 57, 70, 0.2);
}

.segName {
  font-family: var(--font-geist-mono, monospace);
  font-size: 0.5625rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

/* Footer bar */
.settingsFooter {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  padding-top: 1.5rem;
}

.settingsBtnSave {
  background: #e63946;
  color: #fff;
  border: none;
  padding: 0.5rem 1.25rem;
  font-family: var(--font-geist-mono, monospace);
  font-size: 0.625rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  cursor: pointer;
  transition: background 0.15s;
}

.settingsBtnSave:hover {
  background: #c8303c;
}

.settingsBtnSave:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.settingsBtnReset {
  background: none;
  color: rgba(229, 226, 225, 0.4);
  border: 1px solid rgba(53, 53, 52, 0.6);
  padding: 0.5rem 1.25rem;
  font-family: var(--font-geist-mono, monospace);
  font-size: 0.625rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}

.settingsBtnReset:hover {
  color: #e5e2e1;
  border-color: rgba(229, 226, 225, 0.3);
}
```

- [ ] **Step 2: Commit**

```bash
git add app/siem.module.css
git commit -m "feat: add settings page CSS"
```

---

## Task 7: Settings page component

**Files:**
- Create: `frontend/app/settings/page.tsx`

- [ ] **Step 1: Create the file**

```tsx
'use client';

import { useState } from 'react';
import { Sidebar } from '../components/Sidebar';
import { useSettings, Settings } from '../contexts/SettingsContext';
import { useToast } from '../components/Toast';
import styles from '../siem.module.css';

type Tab = 'connection' | 'notifications' | 'display' | 'profile';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'connection',    label: 'Connection',    icon: 'cable' },
  { id: 'notifications', label: 'Notifications', icon: 'notifications' },
  { id: 'display',       label: 'Display',       icon: 'display_settings' },
  { id: 'profile',       label: 'Profile',       icon: 'account_circle' },
];

// Validation
function validate(staged: Settings): Partial<Record<keyof Settings, string>> {
  const errors: Partial<Record<keyof Settings, string>> = {};
  if (!staged.apiBaseUrl || !/^https?:\/\//.test(staged.apiBaseUrl)) {
    errors.apiBaseUrl = 'Must be a valid URL starting with http:// or https://';
  }
  if (!Number.isInteger(staged.pollingInterval) || staged.pollingInterval < 5 || staged.pollingInterval > 300) {
    errors.pollingInterval = 'Must be an integer between 5 and 300';
  }
  if (!Number.isInteger(staged.connectionTimeout) || staged.connectionTimeout < 1000 || staged.connectionTimeout > 30000) {
    errors.connectionTimeout = 'Must be an integer between 1000 and 30000';
  }
  if (!staged.username || staged.username.length > 32) {
    errors.username = 'Required, max 32 characters';
  }
  return errors;
}

// Sub-components
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={styles.settingsToggle}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className={styles.settingsToggleTrack} />
      <span className={styles.settingsToggleThumb} />
    </label>
  );
}

const SEG_ROWS: Record<Settings['rowSpacing'], number> = { tight: 5, standard: 4, relaxed: 3 };
const SEG_HEIGHTS: Record<Settings['rowSpacing'], number> = { tight: 4, standard: 6, relaxed: 9 };

function RowSpacingPicker({
  value,
  onChange,
}: {
  value: Settings['rowSpacing'];
  onChange: (v: Settings['rowSpacing']) => void;
}) {
  const options: Settings['rowSpacing'][] = ['tight', 'standard', 'relaxed'];
  return (
    <div className={styles.segPicker}>
      {options.map((opt) => (
        <button
          key={opt}
          className={`${styles.segOption} ${value === opt ? styles.segOptionActive : ''}`}
          onClick={() => onChange(opt)}
          type="button"
        >
          <div className={styles.segPreview}>
            {Array.from({ length: SEG_ROWS[opt] }).map((_, i) => (
              <div
                key={i}
                className={styles.segPreviewRow}
                style={{ height: SEG_HEIGHTS[opt], marginBottom: 2 }}
              />
            ))}
          </div>
          <span className={styles.segName}>{opt}</span>
        </button>
      ))}
    </div>
  );
}

export default function SettingsPage() {
  const { staged, setSetting, save, reset } = useSettings();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<Tab>('connection');

  const errors = validate(staged);
  const hasErrors = Object.keys(errors).length > 0;

  function handleSave() {
    if (hasErrors) {
      const firstField = Object.keys(errors)[0];
      toast('error', `Invalid value for ${firstField}`);
      return;
    }
    save();
    toast('success', 'Settings saved');
  }

  function handleReset() {
    reset();
    toast('info', 'Settings reset to defaults');
  }

  return (
    <div className={styles.container}>
      <Sidebar />
      <main className={styles.main}>
        <div className={styles.settingsPage}>
          {/* Left tabs */}
          <nav className={styles.settingsTabs}>
            <span className={styles.settingsTabHeader}>// config</span>
            {TABS.map((tab) => (
              <button
                key={tab.id}
                className={`${styles.settingsTab} ${activeTab === tab.id ? styles.settingsTabActive : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <span className={`material-symbols-outlined ${styles.settingsTabIcon}`}>
                  {tab.icon}
                </span>
                {tab.label}
              </button>
            ))}
          </nav>

          {/* Content pane */}
          <div className={styles.settingsContent}>
            {activeTab === 'connection' && (
              <>
                <div className={styles.settingsSectionTitle}>connection</div>

                <div className={styles.settingsRow}>
                  <div>
                    <div className={styles.settingsRowLabel}>API Base URL</div>
                    <div className={styles.settingsRowDesc}>Backend endpoint for all API requests</div>
                    {errors.apiBaseUrl && <div style={{ color: '#e63946', fontFamily: 'var(--font-geist-mono)', fontSize: '0.5625rem', marginTop: '0.25rem' }}>{errors.apiBaseUrl}</div>}
                  </div>
                  <input
                    className={`${styles.settingsInput} ${errors.apiBaseUrl ? styles.settingsInputError : ''}`}
                    value={staged.apiBaseUrl}
                    onChange={(e) => setSetting('apiBaseUrl', e.target.value)}
                  />
                </div>

                <div className={styles.settingsRow}>
                  <div>
                    <div className={styles.settingsRowLabel}>Polling Interval</div>
                    <div className={styles.settingsRowDesc}>How often live data refreshes (seconds, 5–300)</div>
                    {errors.pollingInterval && <div style={{ color: '#e63946', fontFamily: 'var(--font-geist-mono)', fontSize: '0.5625rem', marginTop: '0.25rem' }}>{errors.pollingInterval}</div>}
                  </div>
                  <input
                    className={`${styles.settingsInput} ${errors.pollingInterval ? styles.settingsInputError : ''}`}
                    type="number"
                    value={staged.pollingInterval}
                    onChange={(e) => setSetting('pollingInterval', Number(e.target.value))}
                    style={{ width: 120 }}
                  />
                </div>

                <div className={styles.settingsRow}>
                  <div>
                    <div className={styles.settingsRowLabel}>Auto-reconnect</div>
                    <div className={styles.settingsRowDesc}>Retry connection on disconnect</div>
                  </div>
                  <Toggle
                    checked={staged.autoReconnect}
                    onChange={(v) => setSetting('autoReconnect', v)}
                  />
                </div>

                <div className={styles.settingsRow}>
                  <div>
                    <div className={styles.settingsRowLabel}>Connection Timeout</div>
                    <div className={styles.settingsRowDesc}>Max wait before marking backend unreachable (ms, 1000–30000)</div>
                    {errors.connectionTimeout && <div style={{ color: '#e63946', fontFamily: 'var(--font-geist-mono)', fontSize: '0.5625rem', marginTop: '0.25rem' }}>{errors.connectionTimeout}</div>}
                  </div>
                  <input
                    className={`${styles.settingsInput} ${errors.connectionTimeout ? styles.settingsInputError : ''}`}
                    type="number"
                    value={staged.connectionTimeout}
                    onChange={(e) => setSetting('connectionTimeout', Number(e.target.value))}
                    style={{ width: 120 }}
                  />
                </div>
              </>
            )}

            {activeTab === 'notifications' && (
              <>
                <div className={styles.settingsSectionTitle}>notifications</div>

                <div className={styles.settingsRow}>
                  <div>
                    <div className={styles.settingsRowLabel}>Toast Notifications</div>
                    <div className={styles.settingsRowDesc}>Show in-app toast alerts</div>
                  </div>
                  <Toggle
                    checked={staged.toastsEnabled}
                    onChange={(v) => setSetting('toastsEnabled', v)}
                  />
                </div>

                <div className={styles.settingsRow}>
                  <div>
                    <div className={styles.settingsRowLabel}>Alert on Critical Events</div>
                    <div className={styles.settingsRowDesc}>Fire a toast when the alerts page loads critical-severity rows</div>
                  </div>
                  <Toggle
                    checked={staged.alertOnCritical}
                    onChange={(v) => setSetting('alertOnCritical', v)}
                  />
                </div>
              </>
            )}

            {activeTab === 'display' && (
              <>
                <div className={styles.settingsSectionTitle}>display</div>

                <div className={styles.settingsRow}>
                  <div>
                    <div className={styles.settingsRowLabel}>Row Spacing</div>
                    <div className={styles.settingsRowDesc}>Controls padding between rows in log and event tables</div>
                  </div>
                  <RowSpacingPicker
                    value={staged.rowSpacing}
                    onChange={(v) => setSetting('rowSpacing', v)}
                  />
                </div>

                <div className={styles.settingsRow}>
                  <div>
                    <div className={styles.settingsRowLabel}>Timestamps</div>
                    <div className={styles.settingsRowDesc}>Timestamp display format across all tables</div>
                  </div>
                  <select
                    className={styles.settingsSelect}
                    value={staged.timestampFormat}
                    onChange={(e) => setSetting('timestampFormat', e.target.value as Settings['timestampFormat'])}
                  >
                    <option value="iso">ISO 8601</option>
                    <option value="relative">Relative</option>
                    <option value="local">Local</option>
                  </select>
                </div>
              </>
            )}

            {activeTab === 'profile' && (
              <>
                <div className={styles.settingsSectionTitle}>profile</div>

                <div className={styles.settingsRow}>
                  <div>
                    <div className={styles.settingsRowLabel}>Username</div>
                    <div className={styles.settingsRowDesc}>Display name shown in top bar (max 32 chars)</div>
                    {errors.username && <div style={{ color: '#e63946', fontFamily: 'var(--font-geist-mono)', fontSize: '0.5625rem', marginTop: '0.25rem' }}>{errors.username}</div>}
                  </div>
                  <input
                    className={`${styles.settingsInput} ${errors.username ? styles.settingsInputError : ''}`}
                    value={staged.username}
                    onChange={(e) => setSetting('username', e.target.value)}
                    style={{ width: 180 }}
                  />
                </div>

                <div className={styles.settingsRow}>
                  <div>
                    <div className={styles.settingsRowLabel}>Role</div>
                    <div className={styles.settingsRowDesc}>Access level label</div>
                  </div>
                  <select
                    className={styles.settingsSelect}
                    value={staged.role}
                    onChange={(e) => setSetting('role', e.target.value as Settings['role'])}
                  >
                    <option value="administrator">Administrator</option>
                    <option value="analyst">Analyst</option>
                    <option value="readonly">Read-only</option>
                  </select>
                </div>
              </>
            )}

            <div className={styles.settingsFooter}>
              <button className={styles.settingsBtnReset} onClick={handleReset} type="button">
                Reset
              </button>
              <button
                className={styles.settingsBtnSave}
                onClick={handleSave}
                disabled={hasErrors}
                type="button"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/settings/page.tsx
git commit -m "feat: add settings page with Connection/Notifications/Display/Profile tabs"
```

---

## Task 8: Wire `alertOnCritical` in alerts page

**Files:**
- Modify: `frontend/app/alerts/page.tsx`

- [ ] **Step 1: Import `useSettings` and `useToast`, fire toast on critical fetch**

Add imports at top of `alerts/page.tsx`:
```tsx
import { useSettings } from '../contexts/SettingsContext';
import { useToast } from '../components/Toast';
```

Inside `AlertsPage`, add after existing state declarations:
```tsx
const { settings } = useSettings();
const { toast } = useToast();
```

In the `fetchAlerts` callback, after `setEvents(data.events)`:
```tsx
if (settings.alertOnCritical && data.events.some((e) => e.severity === 'critical')) {
  toast('error', 'Critical events detected', `${data.events.filter((e) => e.severity === 'critical').length} critical alerts on this page`);
}
```

- [ ] **Step 2: Commit**

```bash
git add app/alerts/page.tsx
git commit -m "feat: fire toast on critical alerts when alertOnCritical setting is enabled"
```

---

## Self-Review

**Spec coverage:**
- ✅ SettingsContext with all 10 fields — Task 1
- ✅ SettingsProvider in layout — Task 2
- ✅ toastsEnabled no-op — Task 3
- ✅ Sidebar nav + settings icon → router — Task 4
- ✅ --table-row-padding CSS var — Task 5
- ✅ Settings page CSS — Task 6
- ✅ Settings page UI (all 4 tabs, all fields, save/reset, validation) — Task 7
- ✅ alertOnCritical wired to alerts page — Task 8

**Placeholder scan:** No TBDs or vague steps. All code blocks are complete.

**Type consistency:** `Settings` interface defined in Task 1, imported by name in Tasks 3, 4, 7, 8. `setSetting` signature uses `<K extends keyof Settings>` generic throughout. `staged`, `save`, `reset` names consistent across all tasks.
