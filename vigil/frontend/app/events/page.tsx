'use client';
// honestly had claude opus make this page
// temporary design, mainly to iterate backend API and db usage
// Future: add filtering, searching, sorting, new design, etc

import { useEffect, useState, useCallback } from 'react';
import { Sidebar } from '../components/Sidebar';
import styles from '../siem.module.css';
import type { ParsedLog, EventsResponse } from '../../types/logs';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000';
const PAGE_SIZE = 50;

// columns to display in order of priority
const DISPLAY_COLUMNS = ['timestamp', 'severity', 'host', 'proc', 'src_ip', 'login', 'login_status', 'command'];

function getSeverityClass(severity: string | undefined): string {
  switch (severity?.toLowerCase()) {
    case 'critical':
      return styles.severityCritical;
    case 'warning':
      return styles.severityWarning;
    case 'unknown':
      return styles.severityUnknown;
    default:
      return styles.severityInfo;
  }
}

export default function EventsPage() {
  const [events, setEvents] = useState<ParsedLog[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(async (currentOffset: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/events?limit=${PAGE_SIZE}&offset=${currentOffset}`
      );
      if (!res.ok) throw new Error('Failed to fetch events');
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
    fetchEvents(offset);
  }, [offset, fetchEvents]);

  // figure out which columns have data
  const activeColumns = DISPLAY_COLUMNS.filter((col) =>
    events.some((e) => e[col] != null)
  );
  // fall back to all if nothing matched
  const columns = activeColumns.length > 0 ? activeColumns : DISPLAY_COLUMNS;

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <div className={styles.container}>
      <Sidebar />
      <main className={styles.main}>
        <h1 className={styles.pageTitle}>Events</h1>

        <div className={styles.section}>
          <div className={styles.eventsHeader}>
            <p className={styles.sectionTitleInline}>
              Event Stream — {total} total
            </p>
            <button
              className={styles.refreshBtn}
              onClick={() => fetchEvents(offset)}
              disabled={loading}
            >
              {loading ? 'Loading...' : 'Refresh'}
            </button>
          </div>

          {error && (
            <div className={styles.errorBanner}>
              {error}
            </div>
          )}

          {!loading && events.length === 0 && !error && (
            <p className={styles.emptyState}>
              No events collected yet. Start the log collector to begin monitoring.
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

              {/* Pagination */}
              {totalPages > 1 && (
                <div className={styles.pagination}>
                  <button
                    className={styles.paginationBtn}
                    onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                    disabled={offset === 0}
                  >
                    Previous
                  </button>
                  <span>Page {currentPage} of {totalPages}</span>
                  <button
                    className={styles.paginationBtn}
                    onClick={() => setOffset(offset + PAGE_SIZE)}
                    disabled={offset + PAGE_SIZE >= total}
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}