'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Sidebar } from '../components/Sidebar';
import styles from '../siem.module.css';
import type { ParsedLog, EventsResponse } from '../../types/logs';
import { useCollectorStream, StreamStatus } from '../hooks/useCollectorStream';
import { mergeUniqueEvents } from '../lib/streamEvents';
import { useSettings } from '../contexts/SettingsContext';
import { formatLogValue, getAttributeLabel, getVisibleLogAttributes } from '../lib/logDisplay';

const PAGE_SIZE_OPTIONS = [25, 50, 100, 250, 'All'] as const;
type PageSizeOption = typeof PAGE_SIZE_OPTIONS[number];

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
  // API calls use relative URLs proxied through Next.js rewrites

  const [pageSize, setPageSize] = useState<PageSizeOption>(50);
  const pageSizeNum = pageSize === 'All' ? 1000 : pageSize;

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
      const res = await fetch(`/api/events?limit=${pageSizeNum}&offset=${currentOffset}`);
      if (!res.ok) throw new Error('Failed to fetch events');
      const data: EventsResponse = await res.json();
      setEvents(data.events);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [pageSizeNum]);

  useEffect(() => {
    fetchEvents(offset);
  }, [offset, fetchEvents]);

  // Handle incoming streamed events
  const handleNewEvents = useCallback((incoming: ParsedLog[]) => {
    if (offsetRef.current === 0) {
      let addedCount = 0;
      setEvents((prev) => {
        const merged = mergeUniqueEvents(prev, incoming, pageSizeNum);
        addedCount = merged.addedCount;
        return merged.events;
      });
      if (addedCount > 0) {
        setTotal((prev) => prev + addedCount);
      }
      setPending(0);
    } else {
      // On a deeper page: show banner
      const addedCount = mergeUniqueEvents([], incoming).addedCount;
      if (addedCount > 0) {
        setPending((prev) => prev + addedCount);
        setTotal((prev) => prev + addedCount);
      }
    }
  }, [pageSizeNum]);

  useCollectorStream(handleNewEvents, setStreamStatus);

  const goToLatest = () => {
    setPending(0);
    setOffset(0);
  };

  const columns = getVisibleLogAttributes(events, settings.hiddenLogAttributes);
  const totalPages = Math.ceil(total / pageSizeNum);
  const currentPage = Math.floor(offset / pageSizeNum) + 1;
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
                Showing {offset + 1}–{Math.min(offset + pageSizeNum, total)} of {total.toLocaleString()} results
              </span>
              <span className={styles.toolbarDividerV} />
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'var(--font-geist-mono)', fontSize: '0.5625rem', color: 'rgba(229,226,225,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Rows:
                <select
                  className={styles.pageSizeSelect}
                  value={pageSize}
                  onChange={(e) => {
                    const val = e.target.value;
                    setPageSize(val === 'All' ? 'All' : Number(val) as PageSizeOption);
                    setOffset(0);
                  }}
                >
                  {PAGE_SIZE_OPTIONS.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </label>
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
                      {columns.map((col) => <th key={col}>{getAttributeLabel(col)}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((event, idx) => (
                      <tr key={`${event.id ?? 'ws'}-${idx}`}>
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
                              formatLogValue(col, event[col], settings.timestampFormat)
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && pageSize !== 'All' && (
                <div className={styles.pagination}>
                  <div className={styles.paginationLeft}>
                    <button className={styles.paginationBtn} onClick={() => setOffset(Math.max(0, offset - pageSizeNum))} disabled={offset === 0}>‹ Prev</button>
                    <button className={`${styles.paginationBtn} ${styles.paginationBtnActive}`}>{String(currentPage).padStart(2, '0')}</button>
                    <button className={styles.paginationBtn} onClick={() => setOffset(offset + pageSizeNum)} disabled={offset + pageSizeNum >= total}>Next ›</button>
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
