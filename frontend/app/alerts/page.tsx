'use client';

import { useEffect, useState, useCallback } from 'react';
import { Sidebar } from '../components/Sidebar';
import styles from '../siem.module.css';
import type { ParsedLog, EventsResponse } from '../../types/logs';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000';
const PAGE_SIZE = 50;
const SEVERITY_FILTER = 'critical,warning';

const DISPLAY_COLUMNS = ['timestamp', 'severity', 'host', 'proc', 'src_ip', 'login', 'login_status', 'command'];

function getSeverityClass(severity: string | undefined): string {
  switch (severity?.toLowerCase()) {
    case 'critical': return styles.severityCritical;
    case 'warning':  return styles.severityWarning;
    default:         return styles.severityUnknown;
  }
}

export default function AlertsPage() {
  const [events, setEvents] = useState<ParsedLog[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAlerts(offset);
  }, [offset, fetchAlerts]);

  const activeColumns = DISPLAY_COLUMNS.filter((col) =>
    events.some((e) => e[col] != null)
  );
  const columns = activeColumns.length > 0 ? activeColumns : DISPLAY_COLUMNS;

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  // Stat counts from current page
  const criticalCount = events.filter((e) => e.severity === 'critical').length;
  const warningCount  = events.filter((e) => e.severity === 'warning').length;

  return (
    <div className={styles.container}>
      <Sidebar />
      <main className={styles.main}>
        <h1 className={styles.pageTitle}>Alerts</h1>
        <p className={styles.pageSubtitle}>
          Real-time threat monitoring — critical and warning events only.
        </p>

        {/* Stat Cards */}
        <div className={styles.statCards}>
          {/* Total */}
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

          {/* Critical */}
          <div className={`${styles.statCard} ${styles.statCardCritical}`}>
            <div className={styles.statCardHeader}>
              <span className={`${styles.statCardLabel} ${styles.statCardLabelCritical}`}>Critical Alerts</span>
              <span className={`material-symbols-outlined ${styles.statCardIcon} ${styles.statCardIconCritical}`}>warning</span>
            </div>
            <div className={`${styles.statNumber} ${styles.statNumberCritical}`}>
              {criticalCount}
            </div>
            <div className={styles.statCardMeta} style={{ color: '#ff535b' }}>
              <span className={`material-symbols-outlined ${styles.statMetaIcon}`}>gpp_bad</span>
              URGENT
            </div>
          </div>

          {/* Warning */}
          <div className={`${styles.statCard} ${styles.statCardWarning}`}>
            <div className={styles.statCardHeader}>
              <span className={`${styles.statCardLabel} ${styles.statCardLabelWarning}`}>Warning Alerts</span>
              <span className={`material-symbols-outlined ${styles.statCardIcon} ${styles.statCardIconWarning}`}>error</span>
            </div>
            <div className={`${styles.statNumber} ${styles.statNumberWarning}`}>
              {warningCount}
            </div>
            <div className={styles.statCardMeta} style={{ color: '#ffb95f' }}>
              <span className={`material-symbols-outlined ${styles.statMetaIcon}`}>history</span>
              STABLE
            </div>
          </div>
        </div>

        {/* Table Section */}
        <div className={styles.tableSection}>
          {/* Toolbar */}
          <div className={styles.tableToolbar}>
            <div className={styles.tableToolbarLeft}>
              <div className={styles.liveIndicator}>
                <div className={styles.liveDot}>
                  <span className={styles.liveDotPing} />
                  <span className={styles.liveDotCore} />
                </div>
                <span className={styles.liveText}>Real-Time Threat Monitoring</span>
              </div>
              <span className={styles.toolbarDividerV} />
              <span className={styles.tableCount}>
                Severity: Critical, Warning &nbsp;·&nbsp; {total.toLocaleString()} entries
              </span>
            </div>
            <button
              className={styles.refreshBtn}
              onClick={() => fetchAlerts(offset)}
              disabled={loading}
            >
              <span className={`material-symbols-outlined ${styles.btnIcon}`}>refresh</span>
              {loading ? 'Loading...' : 'Refresh'}
            </button>
          </div>

          {error && (
            <div className={styles.errorBanner}>{error}</div>
          )}

          {!loading && events.length === 0 && !error && (
            <p className={styles.emptyState}>
              No alerts found. Only critical and warning events appear here.
            </p>
          )}

          {events.length > 0 && (
            <>
              <div className={styles.logTableContainer}>
                <table className={styles.logTable}>
                  <thead>
                    <tr>
                      <th>#</th>
                      {columns.map((col) => (
                        <th key={col}>{col.replace(/_/g, ' ')}</th>
                      ))}
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

              {/* Pagination */}
              {totalPages > 1 && (
                <div className={styles.pagination}>
                  <div className={styles.paginationLeft}>
                    <button
                      className={styles.paginationBtn}
                      onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                      disabled={offset === 0}
                    >
                      ‹ Prev
                    </button>
                    <button className={`${styles.paginationBtn} ${styles.paginationBtnActive}`}>
                      {String(currentPage).padStart(2, '0')}
                    </button>
                    <button
                      className={styles.paginationBtn}
                      onClick={() => setOffset(offset + PAGE_SIZE)}
                      disabled={offset + PAGE_SIZE >= total}
                    >
                      Next ›
                    </button>
                  </div>
                  <span className={styles.paginationMeta}>
                    Page {currentPage} of {totalPages}
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
