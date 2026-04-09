'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Sidebar } from '../components/Sidebar';
import styles from '../siem.module.css';
import type { ParsedLog, EventsResponse } from '../../types/logs';
import { useSettings } from '../contexts/SettingsContext';
import { useToast } from '../components/Toast';
import { useCollectorStream, StreamStatus } from '../hooks/useCollectorStream';

const PAGE_SIZE = 50;
const SEVERITY_FILTER = 'critical,warning';
const DISPLAY_COLUMNS = ['timestamp', 'severity', 'host', 'proc', 'src_ip', 'login', 'login_status', 'command', 'uri', 'status_code', 'bytes_sent'];

function getSeverityClass(severity: string | undefined): string {
  switch (severity?.toLowerCase()) {
    case 'critical': return styles.severityCritical;
    case 'warning':  return styles.severityWarning;
    default:         return styles.severityUnknown;
  }
}

const STATUS_DOT: Record<StreamStatus, { core: string; label: string }> = {
  connected:    { core: '#22c55e', label: 'Real-Time Threat Monitoring' },
  connecting:   { core: '#f59e0b', label: 'Connecting…' },
  disconnected: { core: '#ff535b', label: 'Disconnected' },
};

export default function AlertsPage() {
  const { settings } = useSettings();
  const { toast } = useToast();
  const API_BASE = settings.apiBaseUrl;

  const [events, setEvents] = useState<ParsedLog[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamStatus, setStreamStatus] = useState<StreamStatus>('connecting');
  const [pending, setPending] = useState(0);

  const offsetRef = useRef(offset);
  useEffect(() => { offsetRef.current = offset; }, [offset]);

  const fetchAlerts = useCallback(async (currentOffset: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/events?limit=${PAGE_SIZE}&offset=${currentOffset}&severity=${SEVERITY_FILTER}`
      );
      if (!res.ok) throw new Error('Failed to fetch alerts');
      const data: EventsResponse = await res.json();
      setEvents(data.events);
      setTotal(data.total);
      if (settings.alertOnCritical && data.events.some((e) => e.severity === 'critical')) {
        toast('error', 'Critical events detected', `${data.events.filter((e) => e.severity === 'critical').length} critical alerts on this page`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [API_BASE, settings.alertOnCritical, toast]);

  useEffect(() => {
    fetchAlerts(offset);
  }, [offset, fetchAlerts]);

  // Handle incoming streamed events: only care about critical/warning
  const handleNewEvents = useCallback((incoming: ParsedLog[]) => {
    const alertEvents = incoming.filter(
      (e) => e.severity === 'critical' || e.severity === 'warning'
    );
    if (alertEvents.length === 0) return;

    if (settings.alertOnCritical && alertEvents.some((e) => e.severity === 'critical')) {
      const critCount = alertEvents.filter((e) => e.severity === 'critical').length;
      toast('error', 'Critical events detected', `${critCount} new critical alert${critCount !== 1 ? 's' : ''}`);
    }

    if (offsetRef.current === 0) {
      setEvents((prev) => [...alertEvents, ...prev].slice(0, PAGE_SIZE));
      setTotal((prev) => prev + alertEvents.length);
      setPending(0);
    } else {
      setPending((prev) => prev + alertEvents.length);
      setTotal((prev) => prev + alertEvents.length);
    }
  }, [settings.alertOnCritical, toast]);

  useCollectorStream(API_BASE, handleNewEvents, setStreamStatus);

  const goToLatest = () => {
    setPending(0);
    setOffset(0);
  };

  const activeColumns = DISPLAY_COLUMNS.filter((col) => events.some((e) => e[col] != null));
  const columns = activeColumns.length > 0 ? activeColumns : DISPLAY_COLUMNS;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const criticalCount = events.filter((e) => e.severity === 'critical').length;
  const warningCount  = events.filter((e) => e.severity === 'warning').length;
  const dot = STATUS_DOT[streamStatus];

  return (
    <div className={styles.container}>
      <Sidebar />
      <main className={styles.main}>
        <h1 className={styles.pageTitle}>Alerts</h1>
        <p className={styles.pageSubtitle}>
          Real-time threat monitoring: critical and warning events only.
        </p>

        {/* Stat Cards */}
        <div className={styles.statCards}>
          <div className={styles.statCard}>
            <div className={styles.statCardHeader}>
              <span className={styles.statCardLabel}>Total Alerts (24h)</span>
              <span className={`material-symbols-outlined ${styles.statCardIcon}`}>shield</span>
            </div>
            <div className={styles.statNumber}>{total.toLocaleString()}</div>
            <div className={styles.statCardMeta}>
              <span className={`material-symbols-outlined ${styles.statMetaIcon}`}>trending_up</span>
              Critical + warning combined
            </div>
          </div>

          <div className={`${styles.statCard} ${styles.statCardCritical}`}>
            <div className={styles.statCardHeader}>
              <span className={`${styles.statCardLabel} ${styles.statCardLabelCritical}`}>Critical Alerts</span>
              <span className={`material-symbols-outlined ${styles.statCardIcon} ${styles.statCardIconCritical}`}>warning</span>
            </div>
            <div className={`${styles.statNumber} ${styles.statNumberCritical}`}>{criticalCount}</div>
            <div className={styles.statCardMeta} style={{ color: '#ff535b' }}>
              <span className={`material-symbols-outlined ${styles.statMetaIcon}`}>gpp_bad</span>
              URGENT
            </div>
          </div>

          <div className={`${styles.statCard} ${styles.statCardWarning}`}>
            <div className={styles.statCardHeader}>
              <span className={`${styles.statCardLabel} ${styles.statCardLabelWarning}`}>Warning Alerts</span>
              <span className={`material-symbols-outlined ${styles.statCardIcon} ${styles.statCardIconWarning}`}>error</span>
            </div>
            <div className={`${styles.statNumber} ${styles.statNumberWarning}`}>{warningCount}</div>
            <div className={styles.statCardMeta} style={{ color: '#ffb95f' }}>
              <span className={`material-symbols-outlined ${styles.statMetaIcon}`}>history</span>
              STABLE
            </div>
          </div>
        </div>

        {/* Table Section */}
        <div className={styles.tableSection}>
          <div className={styles.tableToolbar}>
            <div className={styles.tableToolbarLeft}>
              <div className={styles.liveIndicator}>
                <div className={styles.liveDot}>
                  {streamStatus === 'connected' && <span className={styles.liveDotPing} />}
                  <span className={styles.liveDotCore} style={{ background: dot.core }} />
                </div>
                <span className={styles.liveText}>{dot.label}</span>
              </div>
              <span className={styles.toolbarDividerV} />
              <span className={styles.tableCount}>
                Severity: Critical, Warning &nbsp;·&nbsp; {total.toLocaleString()} entries
              </span>
            </div>
            <button className={styles.refreshBtn} onClick={() => fetchAlerts(offset)} disabled={loading}>
              <span className={`material-symbols-outlined ${styles.btnIcon}`}>refresh</span>
              {loading ? 'Loading...' : 'Refresh'}
            </button>
          </div>

          {/* New alerts banner */}
          {pending > 0 && (
            <button className={styles.newEventsBanner} onClick={goToLatest}>
              <span className="material-symbols-outlined" style={{ fontSize: '0.875rem' }}>arrow_upward</span>
              {pending} new alert{pending !== 1 ? 's' : ''}: go to latest
            </button>
          )}

          {error && <div className={styles.errorBanner}>{error}</div>}

          {!loading && events.length === 0 && !error && (
            <p className={styles.emptyState}>No alerts found. Only critical and warning events appear here.</p>
          )}

          {events.length > 0 && (
            <>
              <div className={styles.logTableContainer}>
                <table className={styles.logTable}>
                  <thead>
                    <tr>
                      <th>#</th>
                      {columns.map((col) => <th key={col}>{col.replace(/_/g, ' ')}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((event, idx) => (
                      <tr key={event.id as number ?? idx}>
                        <td>{offset + idx + 1}</td>
                        {columns.map((col) => (
                          <td key={col}>
                            {col === 'severity' ? (
                              <span className={`${styles.severity} ${getSeverityClass(event[col] as string)}`}>
                                {(event[col] as string) === 'critical' && (
                                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#ffb4ab', display: 'inline-block', marginRight: 3 }} />
                                )}
                                {(event[col] as string) || 'warning'}
                              </span>
                            ) : (
                              String(event[col] ?? '-')
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className={styles.pagination}>
                  <div className={styles.paginationLeft}>
                    <button className={styles.paginationBtn} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))} disabled={offset === 0}>‹ Prev</button>
                    <button className={`${styles.paginationBtn} ${styles.paginationBtnActive}`}>{String(currentPage).padStart(2, '0')}</button>
                    <button className={styles.paginationBtn} onClick={() => setOffset(offset + PAGE_SIZE)} disabled={offset + PAGE_SIZE >= total}>Next ›</button>
                  </div>
                  <span className={styles.paginationMeta}>Page {currentPage} of {totalPages}</span>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
