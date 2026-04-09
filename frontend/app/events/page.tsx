'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Sidebar } from '../components/Sidebar';
import styles from '../siem.module.css';
import type { ParsedLog, EventsResponse } from '../../types/logs';
import { useCollectorStream, StreamStatus } from '../hooks/useCollectorStream';
import { useSettings } from '../contexts/SettingsContext';

const PAGE_SIZE = 50;
const DISPLAY_COLUMNS = ['timestamp', 'severity', 'host', 'proc', 'src_ip', 'login', 'login_status', 'command', 'uri', 'status_code', 'bytes_sent'];

function getSeverityClass(severity: string | undefined): string {
  switch (severity?.toLowerCase()) {
    case 'critical': return styles.severityCritical;
    case 'warning':  return styles.severityWarning;
    case 'unknown':  return styles.severityUnknown;
    default:         return styles.severityInfo;
  }
}

const STATUS_DOT: Record<StreamStatus, { core: string; label: string }> = {
  connected:    { core: '#22c55e', label: 'Live' },
  connecting:   { core: '#f59e0b', label: 'Connecting…' },
  disconnected: { core: '#ff535b', label: 'Disconnected' },
};

export default function EventsPage() {
  const { settings } = useSettings();
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

  const fetchEvents = useCallback(async (currentOffset: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/events?limit=${PAGE_SIZE}&offset=${currentOffset}`);
      if (!res.ok) throw new Error('Failed to fetch events');
      const data: EventsResponse = await res.json();
      setEvents(data.events);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [API_BASE]);

  useEffect(() => {
    fetchEvents(offset);
  }, [offset, fetchEvents]);

  // Handle incoming streamed events
  const handleNewEvents = useCallback((incoming: ParsedLog[]) => {
    if (offsetRef.current === 0) {
      // On page 1: prepend and cap at PAGE_SIZE
      setEvents((prev) => [...incoming, ...prev].slice(0, PAGE_SIZE));
      setTotal((prev) => prev + incoming.length);
      setPending(0);
    } else {
      // On a deeper page: show banner
      setPending((prev) => prev + incoming.length);
      setTotal((prev) => prev + incoming.length);
    }
  }, []);

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
        <h1 className={styles.pageTitle}>Events</h1>
        <p className={styles.pageSubtitle}>
          Live event stream: all collected telemetry, paginated and sortable.
        </p>

        {/* Stat Cards */}
        <div className={styles.statCards}>
          <div className={styles.statCard}>
            <div className={styles.statCardHeader}>
              <span className={styles.statCardLabel}>Total Events</span>
              <span className={`material-symbols-outlined ${styles.statCardIcon}`}>analytics</span>
            </div>
            <div className={styles.statNumber}>{total.toLocaleString()}</div>
            <div className={styles.statCardMeta}>
              <span className={`material-symbols-outlined ${styles.statMetaIcon}`}>database</span>
              All collected events
            </div>
          </div>

          <div className={`${styles.statCard} ${styles.statCardCritical}`}>
            <div className={styles.statCardHeader}>
              <span className={`${styles.statCardLabel} ${styles.statCardLabelCritical}`}>Critical (this page)</span>
              <span className={`material-symbols-outlined ${styles.statCardIcon} ${styles.statCardIconCritical}`}>warning</span>
            </div>
            <div className={`${styles.statNumber} ${styles.statNumberCritical}`}>{criticalCount}</div>
            <div className={styles.statCardMeta} style={{ color: '#ffb3b1' }}>
              <span className={`material-symbols-outlined ${styles.statMetaIcon}`}>gpp_maybe</span>
              Requires immediate review
            </div>
          </div>

          <div className={`${styles.statCard} ${styles.statCardWarning}`}>
            <div className={styles.statCardHeader}>
              <span className={`${styles.statCardLabel} ${styles.statCardLabelWarning}`}>Warning (this page)</span>
              <span className={`material-symbols-outlined ${styles.statCardIcon} ${styles.statCardIconWarning}`}>error</span>
            </div>
            <div className={`${styles.statNumber} ${styles.statNumberWarning}`}>{warningCount}</div>
            <div className={styles.statCardMeta} style={{ color: '#ffb95f' }}>
              <span className={`material-symbols-outlined ${styles.statMetaIcon}`}>history</span>
              Monitor and investigate
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
                Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total.toLocaleString()} results
              </span>
            </div>
            <button className={styles.refreshBtn} onClick={() => fetchEvents(offset)} disabled={loading}>
              <span className={`material-symbols-outlined ${styles.btnIcon}`}>refresh</span>
              {loading ? 'Loading...' : 'Refresh'}
            </button>
          </div>

          {/* New events banner */}
          {pending > 0 && (
            <button className={styles.newEventsBanner} onClick={goToLatest}>
              <span className={`material-symbols-outlined`} style={{ fontSize: '0.875rem' }}>arrow_upward</span>
              {pending} new event{pending !== 1 ? 's' : ''}: go to latest
            </button>
          )}

          {error && <div className={styles.errorBanner}>{error}</div>}

          {!loading && events.length === 0 && !error && (
            <p className={styles.emptyState}>No events collected yet. Start the log collector to begin monitoring.</p>
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
                                {(event[col] as string) || 'info'}
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
