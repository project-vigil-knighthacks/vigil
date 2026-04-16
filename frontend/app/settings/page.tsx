'use client';

import { useEffect, useState } from 'react';
import { Sidebar } from '../components/Sidebar';
import { useSettings, Settings } from '../contexts/SettingsContext';
import { useToast } from '../components/Toast';
import styles from '../siem.module.css';
import type { EventsResponse, ParsedLog } from '../../types/logs';
import { getAttributeLabel, getAttributePickerOptions, REQUIRED_LOG_ATTRIBUTES } from '../lib/logDisplay';

type Tab = 'connection' | 'notifications' | 'display' | 'danger';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'connection',    label: 'Connection',    icon: 'cable' },
  { id: 'notifications', label: 'Notifications', icon: 'notifications' },
  { id: 'display',       label: 'Display',       icon: 'display_settings' },
  { id: 'danger',        label: 'Danger Zone',   icon: 'warning' },
];

function validate(staged: Settings): Partial<Record<keyof Settings, string>> {
  const errors: Partial<Record<keyof Settings, string>> = {};
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
  const [email, setEmail] = useState('');
  const [minSeverity, setMinSeverity] = useState<'critical' | 'warning' | 'info'>('warning');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFlushing, setIsFlushing] = useState(false);
  const [flushCooldownEnd, setFlushCooldownEnd] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [resetArmed, setResetArmed] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [attributeEvents, setAttributeEvents] = useState<ParsedLog[]>([]);
  const [attributesLoading, setAttributesLoading] = useState(false);

  const errors = validate(staged);
  const hasErrors = Object.keys(errors).length > 0;

  useEffect(() => {
    const controller = new AbortController();

    async function loadAttributeEvents() {
      setAttributesLoading(true);
      try {
        const res = await fetch('/api/events?limit=200&offset=0', {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error('Failed to detect log attributes');
        const data: EventsResponse = await res.json();
        setAttributeEvents(data.events);
      } catch (err) {
        if (controller.signal.aborted) return;
        const message = err instanceof Error ? err.message : 'Failed to detect log attributes';
        toast('error', message);
      } finally {
        if (!controller.signal.aborted) setAttributesLoading(false);
      }
    }

    loadAttributeEvents();
    return () => controller.abort();
  }, [toast]);

  // Poll pending alert count when notifications tab is active
  useEffect(() => {
    if (activeTab !== 'notifications') return;
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch('/api/alerts/pending');
        if (res.ok) {
          const data = await res.json();
          const total = Object.values(data.pending as Record<string, number>).reduce((a: number, b: number) => a + b, 0);
          if (!cancelled) setPendingCount(total);
        }
      } catch { /* ignore */ }
    }
    poll();
    const id = setInterval(poll, 15_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [activeTab]);

  // Countdown timer for flush cooldown
  const [, setTick] = useState(0);
  useEffect(() => {
    if (flushCooldownEnd <= Date.now()) return;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [flushCooldownEnd]);

  const flushCooldownRemaining = Math.max(0, Math.ceil((flushCooldownEnd - Date.now()) / 1000));
  const flushOnCooldown = flushCooldownRemaining > 0;

  async function handleFlushAlerts() {
    setIsFlushing(true);
    try {
      const res = await fetch('/api/alerts/flush', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Flush failed');
      if (data.sent === 0) {
        toast('info', 'No pending alerts to send');
      } else {
        toast('success', `Digest sent to ${data.sent} recipient${data.sent !== 1 ? 's' : ''}`);
      }
      setPendingCount(0);
      setFlushCooldownEnd(Date.now() + 5 * 60 * 1000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to flush alerts';
      toast('error', message);
    } finally {
      setIsFlushing(false);
    }
  }

  const availableAttributeOptions = getAttributePickerOptions(attributeEvents);

  function toggleHiddenAttribute(attribute: string) {
    if (REQUIRED_LOG_ATTRIBUTES.includes(attribute as (typeof REQUIRED_LOG_ATTRIBUTES)[number])) return;

    const hidden = new Set(staged.hiddenLogAttributes);
    if (hidden.has(attribute)) {
      hidden.delete(attribute);
    } else {
      hidden.add(attribute);
    }

    setSetting('hiddenLogAttributes', [...hidden].sort());
  }

  function setAllOptionalAttributesHidden(hidden: boolean) {
    setSetting('hiddenLogAttributes', hidden ? availableAttributeOptions : []);
  }

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

  async function handleAddSubscription() {
    if (!email || !email.includes('@')) {
      toast('error', 'Enter a valid email address');
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/add_subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, min_severity: minSeverity }),
      });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || 'Failed to add subscription');
      }
      toast('success', 'Notification subscription saved');
      setEmail('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add subscription';
      toast('error', message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResetDatabase() {
    if (!resetArmed) {
      setResetArmed(true);
      return;
    }
    setIsResetting(true);
    try {
      const res = await fetch('/api/events/reset', { method: 'DELETE' });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || 'Failed to reset database');
      }
      const data = await res.json();
      toast('success', `Database reset — ${data.deleted} event(s) deleted`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reset database';
      toast('error', message);
    } finally {
      setResetArmed(false);
      setIsResetting(false);
    }
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

                <div className={styles.settingsRow}>
                  <div>
                    <div className={styles.settingsRowLabel}>Email Notifications</div>
                    <div className={styles.settingsRowDesc}>Send alerts to an email address at or above a minimum severity</div>
                  </div>
                  <div className={styles.settingsRowRight}>
                    <input
                      className={styles.settingsInput}
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                    <select
                      className={styles.settingsSelect}
                      value={minSeverity}
                      onChange={(e) => setMinSeverity(e.target.value as 'critical' | 'warning' | 'info')}
                    >
                      <option value="critical">Critical</option>
                      <option value="warning">Warning</option>
                      <option value="info">Info</option>
                    </select>
                    <button
                      className={styles.settingsBtnSave}
                      onClick={handleAddSubscription}
                      disabled={isSubmitting}
                      type="button"
                    >
                      {isSubmitting ? 'Saving...' : 'Add'}
                    </button>
                  </div>
                </div>

                <div className={styles.settingsRow}>
                  <div>
                    <div className={styles.settingsRowLabel}>Force Email Digest</div>
                    <div className={styles.settingsRowDesc}>
                      Send all queued alerts now{pendingCount > 0 ? ` (${pendingCount} pending)` : ''}
                    </div>
                  </div>
                  <div className={styles.settingsRowRight}>
                    <button
                      className={styles.settingsBtnSave}
                      onClick={handleFlushAlerts}
                      disabled={isFlushing || flushOnCooldown}
                      type="button"
                      style={{ minWidth: '8rem' }}
                    >
                      {isFlushing
                        ? 'Sending...'
                        : flushOnCooldown
                          ? `${Math.floor(flushCooldownRemaining / 60)}:${String(flushCooldownRemaining % 60).padStart(2, '0')}`
                          : 'Send Now'}
                    </button>
                  </div>
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

                <div className={styles.settingsRow}>
                  <div>
                    <div className={styles.settingsRowLabel}>Log Attributes</div>
                    <div className={styles.settingsRowDesc}>
                      Detects attributes from recent logs and controls which optional fields appear on dashboard, events, and alerts. Timestamp, severity, source IP, and URI stay visible.
                    </div>
                  </div>
                  <div className={styles.settingsAttrActions}>
                    <button className={styles.settingsBtnReset} type="button" onClick={() => setAllOptionalAttributesHidden(false)}>
                      Show All
                    </button>
                    <button className={styles.settingsBtnReset} type="button" onClick={() => setAllOptionalAttributesHidden(true)}>
                      Hide Optional
                    </button>
                  </div>
                </div>

                <div className={styles.settingsAttrGrid}>
                  {REQUIRED_LOG_ATTRIBUTES.map((attribute) => (
                    <button
                      key={attribute}
                      type="button"
                      className={`${styles.settingsAttrChip} ${styles.settingsAttrChipLocked}`}
                      disabled
                    >
                      <span>{getAttributeLabel(attribute)}</span>
                      <span className={styles.settingsAttrMeta}>required</span>
                    </button>
                  ))}

                  {availableAttributeOptions.map((attribute) => {
                    const visible = !staged.hiddenLogAttributes.includes(attribute);
                    return (
                      <button
                        key={attribute}
                        type="button"
                        className={`${styles.settingsAttrChip} ${visible ? styles.settingsAttrChipActive : ''}`}
                        onClick={() => toggleHiddenAttribute(attribute)}
                      >
                        <span>{getAttributeLabel(attribute)}</span>
                        <span className={styles.settingsAttrMeta}>{visible ? 'visible' : 'hidden'}</span>
                      </button>
                    );
                  })}

                  {!attributesLoading && availableAttributeOptions.length === 0 && (
                    <div className={styles.settingsAttrEmpty}>
                      No optional attributes detected yet. Once logs include fields like HTTP method, login status, or user ID, they will appear here.
                    </div>
                  )}

                  {attributesLoading && (
                    <div className={styles.settingsAttrEmpty}>Scanning recent events for available attributes...</div>
                  )}
                </div>
              </>
            )}

            {activeTab === 'danger' && (
              <>
                <div className={styles.settingsSectionTitle}>danger zone</div>

                <div className={`${styles.settingsRow} ${styles.dangerRow}`}>
                  <div>
                    <div className={styles.settingsRowLabel}>Reset Database</div>
                    <div className={styles.settingsRowDesc}>
                      Permanently delete all events from the SQLite database. This cannot be undone.
                    </div>
                  </div>
                  <button
                    className={resetArmed ? styles.dangerBtnConfirm : styles.dangerBtn}
                    onClick={handleResetDatabase}
                    onBlur={() => setResetArmed(false)}
                    disabled={isResetting}
                    type="button"
                  >
                    {isResetting
                      ? 'Resetting...'
                      : resetArmed
                        ? 'Confirm Reset'
                        : 'Reset Database'}
                  </button>
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
