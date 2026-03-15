'use client';

import { useMemo } from 'react';
import type { LogParseResult, ParsedLog } from '../../types/logs';
import styles from '../siem.module.css';

interface LogOutputProps {
  result: LogParseResult | null;
  error?: string | null;
  loading?: boolean;
  onSave?: () => void;
  saving?: boolean;
  saved?: boolean;
}

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

function formatTimestamp(ts: string | undefined): string {
  if (!ts) return '-';
  // Try to parse and format, fallback to original
  try {
    const date = new Date(ts);
    if (!isNaN(date.getTime())) {
      return date.toISOString().replace('T', ' ').substring(0, 19);
    }
  } catch {
    // ignore
  }
  return ts;
}

function getDisplayColumns(logs: ParsedLog[]): string[] {
  // Determine columns to display based on log data
  const allKeys = new Set<string>();
  logs.slice(0, 10).forEach((log) => {
    Object.keys(log).forEach((key) => {
      if (key !== 'raw' && key !== 'parse_error' && key !== 'unmatched') {
        allKeys.add(key);
      }
    });
  });

  // Prioritize common grokmoment SIEM columns
  const priority = ['timestamp', 'severity', 'host', 'proc', 'src_ip', 'login', 'login_status', 'command'];
  const sorted = Array.from(allKeys).sort((a, b) => {
    const aIdx = priority.indexOf(a);
    const bIdx = priority.indexOf(b);
    if (aIdx >= 0 && bIdx >= 0) return aIdx - bIdx;
    if (aIdx >= 0) return -1;
    if (bIdx >= 0) return 1;
    return a.localeCompare(b);
  });

  return sorted.slice(0, 6); // Limit to 6 columns for readability
}

function LogTable({ logs }: { logs: ParsedLog[] }) {
  const columns = useMemo(() => getDisplayColumns(logs), [logs]);

  return (
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
          {logs.map((log, idx) => (
            <tr key={idx} className={log.unmatched ? styles.unmatchedRow : ''}>
              <td>{idx + 1}</td>
              {log.unmatched ? (
                <td colSpan={columns.length} className={styles.unmatchedCell}>
                  <span className={`${styles.severity} ${styles.severityUnknown}`}>UNMATCHED</span>
                  {' '}{log.raw}
                </td>
              ) : (
                columns.map((col) => (
                  <td key={col}>
                    {col === 'severity' ? (
                      <span className={`${styles.severity} ${getSeverityClass(log[col] as string)}`}>
                        {(log[col] as string) || 'info'}
                      </span>
                    ) : col === 'timestamp' ? (
                      formatTimestamp(log[col] as string)
                    ) : (
                      String(log[col] ?? '-')
                    )}
                  </td>
                ))
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LogOutput({ result, error, loading, onSave, saving, saved }: LogOutputProps) {
  if (loading) {
    return (
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Parsed Output</h2>
        <div className={styles.loading}>
          <div className={styles.spinner} />
          Parsing logs...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Parsed Output</h2>
        <div className={styles.error}>{error}</div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Parsed Output</h2>
        <div className={styles.empty}>
          <svg
            className={styles.emptyIcon}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <p>Upload a log file to see parsed results</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.section}>
      <div className={styles.eventsHeader}>
        <h2 className={styles.sectionTitleInline}>Parsed Output</h2>
        {onSave && (
          <button
            className={styles.refreshBtn}
            onClick={onSave}
            disabled={saving || saved || result.learning_in_progress}
            title={
              result.learning_in_progress
                ? 'Waiting for new Grok patterns to finish learning before saving.'
                : undefined
            }
          >
            {result.learning_in_progress
              ? 'Waiting on LLM'
              : saving
              ? 'Saving...'
              : saved
              ? 'Saved!'
              : 'Save to DB'}
          </button>
        )}
      </div>
      {result.learning_in_progress && (
        <div className={styles.learningBanner}>
          <svg
            className={styles.warningIcon}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M12 7v5h.01M12 17.5a5.5 5.5 0 100-11 5.5 5.5 0 000 11z"
            />
          </svg>
          <div>
            <strong>Learning new patterns</strong>
            <p>Unmatched lines may still resolve once the LLM finishes generating Grok patterns.</p>
          </div>
        </div>
      )}
      {result.api_key_required && (
        <div className={styles.warning}>
          <svg
            className={styles.warningIcon}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <div>
            <strong>API Key Required for Pattern Learning</strong>
            <p>{result.api_key_message}</p>
          </div>
        </div>
      )}
      <div className={styles.logOutput}>
        <div className={styles.logMeta}>
          <div className={styles.logMetaItem}>
            Format: <span className={styles.logMetaValue}>{result.format.toUpperCase()}</span>
          </div>
          <div className={styles.logMetaItem}>
            Events: <span className={styles.logMetaValue}>{result.count}</span>
          </div>
          {result.filename && (
            <div className={styles.logMetaItem}>
              File: <span className={styles.logMetaValue}>{result.filename}</span>
            </div>
          )}
          <div className={styles.logMetaItem}>
            Parsed: <span className={styles.logMetaValue}>{formatTimestamp(result.parsed_at)}</span>
          </div>
        </div>
        <LogTable logs={result.logs} />
      </div>
    </div>
  );
}
