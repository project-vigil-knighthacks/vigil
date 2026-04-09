'use client';

import { useState } from 'react';
import { Sidebar } from '../components/Sidebar';
import { useSettings, Settings } from '../contexts/SettingsContext';
import { useToast } from '../components/Toast';
import styles from '../siem.module.css';

type Tab = 'connection' | 'notifications' | 'display';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'connection',    label: 'Connection',    icon: 'cable' },
  { id: 'notifications', label: 'Notifications', icon: 'notifications' },
  { id: 'display',       label: 'Display',       icon: 'display_settings' },
];

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
  return errors;
}

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

const errorStyle = {
  color: '#e63946',
  fontFamily: 'var(--font-geist-mono)',
  fontSize: '0.5625rem',
  marginTop: '0.25rem',
};

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
                    {errors.apiBaseUrl && <div style={errorStyle}>{errors.apiBaseUrl}</div>}
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
                    {errors.pollingInterval && <div style={errorStyle}>{errors.pollingInterval}</div>}
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
                    {errors.connectionTimeout && <div style={errorStyle}>{errors.connectionTimeout}</div>}
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
