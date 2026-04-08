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
    case 'critical': return styles.severityCritical;
    case 'warning':  return styles.severityWarning;
    case 'unknown':  return styles.severityUnknown;
    default:         return styles.severityInfo;
  }
}

function formatTimestamp(ts: string | undefined): string {
  if (!ts) return '-';
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
  const allKeys = new Set<string>();
  logs.slice(0, 10).forEach((log) => {
    Object.keys(log).forEach((key) => {
      if (key !== 'raw' && key !== 'parse_error' && key !== 'unmatched') {
        allKeys.add(key);
      }
    });
  });

  const priority = ['timestamp', 'severity', 'host', 'proc', 'src_ip', 'login', 'login_status', 'command'];
  const sorted = Array.from(allKeys).sort((a, b) => {
    const aIdx = priority.indexOf(a);
    const bIdx = priority.indexOf(b);
    if (aIdx >= 0 && bIdx >= 0) return aIdx - bIdx;
    if (aIdx >= 0) return -1;
    if (bIdx >= 0) return 1;
    return a.localeCompare(b);
  });

  return sorted.slice(0, 6);
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
                        {col === 'severity' && (log[col] as string) === 'critical' && (
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#ffb4ab', display: 'inline-block', marginRight: 3 }} />
                        )}
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
        <div className={styles.loading}>
          <div className={styles.spinner} />
          Normalizing streams...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.section}>
        <div className={styles.error}>{error}</div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className={styles.section}>
        <div className={styles.empty}>
          <span className={`material-symbols-outlined ${styles.emptyIcon}`}>folder_open</span>
          <p style={{ fontFamily: 'var(--font-geist-mono)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Upload a log file to see parsed results
          </p>
        </div>
      </div>
    );
  }

  const saveBtnLabel = result.learning_in_progress
    ? 'Waiting on LLM'
    : saving
    ? 'Saving...'
    : saved
    ? 'Saved!'
    : 'Save to DB';

  return (
    <div className={styles.section} style={{ padding: 0 }}>
      {/* Toolbar */}
      <div className={styles.outputToolbar}>
        <div className={styles.outputToolbarLeft}>
          <div className={styles.outputToolbarTitle}>
            <span className={`material-symbols-outlined ${styles.outputToolbarIcon}`}>data_object</span>
            <span className={styles.outputToolbarLabel}>Parser Output</span>
          </div>

          <span className={styles.toolbarDivider} />

          <div className={styles.logMeta}>
            <div className={styles.logMetaItem}>
              <span className={styles.logMetaLabel}>Format</span>
              <span className={styles.logMetaValue}>{result.format.toUpperCase()}</span>
            </div>
            <div className={styles.logMetaItem}>
              <span className={styles.logMetaLabel}>Events</span>
              <span className={styles.logMetaValue} style={{ color: '#ffb3b1' }}>
                {result.count.toLocaleString()} detected
              </span>
            </div>
            {result.filename && (
              <div className={styles.logMetaItem}>
                <span className={styles.logMetaLabel}>Filename</span>
                <span className={styles.logMetaValue}>{result.filename}</span>
              </div>
            )}
            <div className={styles.logMetaItem}>
              <span className={styles.logMetaLabel}>Parsed</span>
              <span className={styles.logMetaValue}>{formatTimestamp(result.parsed_at)}</span>
            </div>
          </div>
        </div>

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
            <span className={`material-symbols-outlined ${styles.btnIcon}`}>database</span>
            {saveBtnLabel}
          </button>
        )}
      </div>

      {/* Banners */}
      {result.learning_in_progress && (
        <div className={styles.learningBanner}>
          <span className={`material-symbols-outlined ${styles.warningIcon}`}>psychology</span>
          <div>
            <strong>Learning new patterns</strong>
            <p>Unmatched lines may still resolve once the LLM finishes generating Grok patterns.</p>
          </div>
        </div>
      )}

      {result.api_key_required && (
        <div className={styles.warning}>
          <span className={`material-symbols-outlined ${styles.warningIcon}`}>warning</span>
          <div>
            <strong>API Key Required for Pattern Learning</strong>
            <p>{result.api_key_message}</p>
          </div>
        </div>
      )}

      {/* Table */}
      <div className={styles.logOutput}>
        <LogTable logs={result.logs} />
      </div>
    </div>
  );
}
