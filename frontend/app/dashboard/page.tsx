'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Sidebar } from '../components/Sidebar';
import styles from '../siem.module.css';
import type { ParsedLog } from '../../types/logs';
import { useCollectorStream, StreamStatus } from '../hooks/useCollectorStream';
import { mergeUniqueEvents } from '../lib/streamEvents';
import { useSettings } from '../contexts/SettingsContext';
import { formatLogValue, getAttributeLabel, getVisibleDashboardAttributes } from '../lib/logDisplay';

/* ── time-range buckets ── */
type TimeRange = '1h' | '6h' | '24h' | '7d' | '30d';
const RANGE_LABELS: Record<TimeRange, string> = { '1h': '1 Hour', '6h': '6 Hours', '24h': '24 Hours', '7d': '7 Days', '30d': '30 Days' };
const RANGE_MS: Record<TimeRange, number> = {
  '1h': 3_600_000,
  '6h': 21_600_000,
  '24h': 86_400_000,
  '7d': 604_800_000,
  '30d': 2_592_000_000,
};
const BUCKET_COUNTS: Record<TimeRange, number> = { '1h': 12, '6h': 12, '24h': 12, '7d': 7, '30d': 15 };

function bucketLabel(date: Date, range: TimeRange): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  if (range === '1h' || range === '6h') return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  if (range === '24h') return `${pad(date.getHours())}:00`;
  if (range === '7d') return date.toLocaleDateString('en-US', { weekday: 'short' });
  return `${date.toLocaleDateString('en-US', { month: 'short' })} ${date.getDate()}`;
}

/* ── severity colours ── */
const SEV_COLOURS: Record<string, string> = {
  critical: '#ff535b',
  warning: '#ee9800',
  info: '#22c55e',
  unknown: 'rgba(229,226,225,0.3)',
};

const STATUS_DOT: Record<StreamStatus, { colour: string; label: string }> = {
  connected: { colour: '#22c55e', label: 'Live' },
  connecting: { colour: '#f59e0b', label: 'Connecting…' },
  disconnected: { colour: '#ff535b', label: 'Disconnected' },
};

export default function DashboardPage() {
  const { settings } = useSettings();
  // API calls use relative URLs proxied through Next.js rewrites

  /* state */
  const [allEvents, setAllEvents] = useState<ParsedLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState<TimeRange>('24h');
  const [streamStatus, setStreamStatus] = useState<StreamStatus>('connecting');
  const [healthOk, setHealthOk] = useState<boolean | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  /* fetch the latest events (used for the feed + stats) */
  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/events?limit=1000&offset=0');
      if (!res.ok) throw new Error('fetch failed');
      const data = await res.json();
      setAllEvents(data.events as ParsedLog[]);
      setTotal(data.total);
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  /* health ping */
  useEffect(() => {
    const ping = async () => {
      const t0 = performance.now();
      try {
        const r = await fetch('/api/health');
        setLatencyMs(Math.round(performance.now() - t0));
        setHealthOk((await r.json()).ok === true);
      } catch {
        setLatencyMs(Math.round(performance.now() - t0));
        setHealthOk(false);
      }
    };
    ping();
    const id = setInterval(ping, 5000);
    return () => clearInterval(id);
  }, []);

  /* live stream – prepend to allEvents */
  const handleNewEvents = useCallback((incoming: ParsedLog[]) => {
    let addedCount = 0;
    setAllEvents((prev) => {
      const merged = mergeUniqueEvents(prev, incoming, 1000);
      addedCount = merged.addedCount;
      return merged.events;
    });
    if (addedCount > 0) {
      setTotal((prev) => prev + addedCount);
    }
  }, []);
  useCollectorStream(handleNewEvents, setStreamStatus);

  /* ── derived stats ── */
  const criticalTotal = allEvents.filter((e) => e.severity === 'critical').length;
  const warningTotal = allEvents.filter((e) => e.severity === 'warning').length;
  const infoTotal = allEvents.filter((e) => e.severity === 'info').length;

  /* severity breakdown for the doughnut */
  const sevCounts = { critical: criticalTotal, warning: warningTotal, info: infoTotal, unknown: total - criticalTotal - warningTotal - infoTotal };
  const sevTotal = Object.values(sevCounts).reduce((a, b) => a + b, 0) || 1;

  /* ── time-series buckets ── */
  const now = Date.now();
  const rangeMs = RANGE_MS[range];
  const bucketCount = BUCKET_COUNTS[range];
  const bucketSize = rangeMs / bucketCount;

  const buckets: { label: string; critical: number; warning: number; info: number }[] = [];
  for (let i = 0; i < bucketCount; i++) {
    const start = now - rangeMs + i * bucketSize;
    buckets.push({ label: bucketLabel(new Date(start + bucketSize / 2), range), critical: 0, warning: 0, info: 0 });
  }
  for (const ev of allEvents) {
    const ts = ev.timestamp ? new Date(ev.timestamp).getTime() : NaN;
    if (isNaN(ts) || ts < now - rangeMs || ts > now) continue;
    const idx = Math.min(Math.floor((ts - (now - rangeMs)) / bucketSize), bucketCount - 1);
    const sev = (ev.severity || 'info') as 'critical' | 'warning' | 'info';
    if (sev in buckets[idx]) buckets[idx][sev]++;
  }
  const chartMax = Math.max(...buckets.map((b) => b.critical + b.warning + b.info), 1);

  /* recent events for live feed (newest first, max 15) */
  const feedEvents = allEvents.slice(0, 15);
  const feedExtraAttributes = getVisibleDashboardAttributes(allEvents, settings.hiddenLogAttributes);

  /* top source IPs */
  const ipMap = new Map<string, number>();
  for (const ev of allEvents) {
    const ip = ev.src_ip;
    if (ip) ipMap.set(ip, (ipMap.get(ip) || 0) + 1);
  }
  const topIPs = [...ipMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  /* top targeted URIs (for attack surface) */
  const uriMap = new Map<string, { count: number; severity: string }>();
  for (const ev of allEvents) {
    const uri = ev.uri as string | undefined;
    if (uri) {
      const prev = uriMap.get(uri);
      if (!prev || prev.count < 1) uriMap.set(uri, { count: (prev?.count || 0) + 1, severity: ev.severity || 'info' });
      else uriMap.set(uri, { count: prev.count + 1, severity: ev.severity === 'critical' ? 'critical' : prev.severity });
    }
  }
  const topURIs = [...uriMap.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 5);

  const dot = STATUS_DOT[streamStatus];

  /* ── hover for chart bars ── */
  const chartRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; label: string; c: number; w: number; i: number } | null>(null);

  return (
    <div className={styles.container}>
      <Sidebar />
      <main className={styles.main}>
        <h1 className={styles.pageTitle}>Dashboard</h1>
        <p className={styles.pageSubtitle}>
          Operational overview — live telemetry, threat distribution, and system status at a glance.
        </p>

        {/* ── Top Stat Cards ── */}
        <div className={styles.statCards} style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          {/* Total Events */}
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

          {/* Critical */}
          <div className={`${styles.statCard} ${styles.statCardCritical}`}>
            <div className={styles.statCardHeader}>
              <span className={`${styles.statCardLabel} ${styles.statCardLabelCritical}`}>Critical</span>
              <span className={`material-symbols-outlined ${styles.statCardIcon} ${styles.statCardIconCritical}`}>warning</span>
            </div>
            <div className={`${styles.statNumber} ${styles.statNumberCritical}`}>{criticalTotal}</div>
            <div className={styles.statCardMeta}>
              <span className={`material-symbols-outlined ${styles.statMetaIcon}`}>priority_high</span>
              Requires immediate review
            </div>
          </div>

          {/* Warning */}
          <div className={`${styles.statCard} ${styles.statCardWarning}`}>
            <div className={styles.statCardHeader}>
              <span className={`${styles.statCardLabel} ${styles.statCardLabelWarning}`}>Warning</span>
              <span className={`material-symbols-outlined ${styles.statCardIcon} ${styles.statCardIconWarning}`}>error</span>
            </div>
            <div className={`${styles.statNumber} ${styles.statNumberWarning}`}>{warningTotal}</div>
            <div className={styles.statCardMeta}>
              <span className={`material-symbols-outlined ${styles.statMetaIcon}`}>schedule</span>
              Monitor and investigate
            </div>
          </div>

          {/* System Status */}
          <div className={styles.statCard} style={{ borderLeftColor: healthOk ? '#22c55e' : '#ff535b' }}>
            <div className={styles.statCardHeader}>
              <span className={styles.statCardLabel}>System Status</span>
              <span className={`material-symbols-outlined ${styles.statCardIcon}`} style={{ color: healthOk ? '#22c55e' : '#ff535b' }}>
                {healthOk ? 'check_circle' : 'cancel'}
              </span>
            </div>
            <div className={styles.statNumber} style={{ fontSize: '1.75rem', color: healthOk ? '#22c55e' : '#ff535b' }}>
              {healthOk === null ? '…' : healthOk ? 'ONLINE' : 'OFFLINE'}
            </div>
            <div className={styles.statCardMeta}>
              <span className={`material-symbols-outlined ${styles.statMetaIcon}`}>speed</span>
              {latencyMs !== null ? `${latencyMs}ms latency` : 'Checking…'}
            </div>
          </div>
        </div>

        {/* ── Time-series chart + severity breakdown ── */}
        <div className={styles.dashGrid}>
          {/* Stacked bar chart */}
          <div className={styles.dashPanel}>
            <div className={styles.dashPanelHeader}>
              <h3 className={styles.dashPanelTitle}>Events Over Time</h3>
              <div className={styles.dashRangePicker}>
                {(Object.keys(RANGE_LABELS) as TimeRange[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    className={`${styles.dashRangeBtn} ${range === r ? styles.dashRangeBtnActive : ''}`}
                    onClick={() => setRange(r)}
                  >
                    {RANGE_LABELS[r]}
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.dashChart} ref={chartRef} onMouseLeave={() => setTooltip(null)}>
              {buckets.map((b, i) => {
                const totalH = b.critical + b.warning + b.info;
                const pct = (totalH / chartMax) * 100;
                const cPct = totalH ? (b.critical / totalH) * pct : 0;
                const wPct = totalH ? (b.warning / totalH) * pct : 0;
                const iPct = totalH ? (b.info / totalH) * pct : 0;
                return (
                  <div
                    key={i}
                    className={styles.dashChartCol}
                    onMouseMove={(e) => {
                      const rect = chartRef.current?.getBoundingClientRect();
                      if (!rect) return;
                      setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top - 48, label: b.label, c: b.critical, w: b.warning, i: b.info });
                    }}
                  >
                    <div className={styles.dashChartStack} style={{ height: `${Math.max(pct, 2)}%` }}>
                      {cPct > 0 && <div style={{ height: `${(cPct / pct) * 100}%`, background: SEV_COLOURS.critical, minHeight: 2 }} />}
                      {wPct > 0 && <div style={{ height: `${(wPct / pct) * 100}%`, background: SEV_COLOURS.warning, minHeight: 2 }} />}
                      {iPct > 0 && <div style={{ height: `${(iPct / pct) * 100}%`, background: SEV_COLOURS.info, minHeight: 2 }} />}
                    </div>
                    <span className={styles.dashChartLabel}>{b.label}</span>
                  </div>
                );
              })}
              {tooltip && (
                <div className={styles.dashTooltip} style={{ left: tooltip.x, top: tooltip.y }}>
                  <strong>{tooltip.label}</strong>
                  <span style={{ color: SEV_COLOURS.critical }}>Critical: {tooltip.c}</span>
                  <span style={{ color: SEV_COLOURS.warning }}>Warning: {tooltip.w}</span>
                  <span style={{ color: SEV_COLOURS.info }}>Info: {tooltip.i}</span>
                </div>
              )}
            </div>
          </div>

          {/* Severity Breakdown (doughnut-style ring) */}
          <div className={styles.dashPanel} style={{ minWidth: 240, maxWidth: 320 }}>
            <div className={styles.dashPanelHeader}>
              <h3 className={styles.dashPanelTitle}>Severity Breakdown</h3>
            </div>
            <div className={styles.dashRingWrap}>
              <svg viewBox="0 0 36 36" className={styles.dashRing}>
                {(() => {
                  let offset = 0;
                  return (['critical', 'warning', 'info', 'unknown'] as const).map((sev) => {
                    const pct = (sevCounts[sev] / sevTotal) * 100;
                    const el = (
                      <circle
                        key={sev}
                        r="15.9155"
                        cx="18"
                        cy="18"
                        fill="none"
                        stroke={SEV_COLOURS[sev]}
                        strokeWidth="3.8"
                        strokeDasharray={`${pct} ${100 - pct}`}
                        strokeDashoffset={`${-offset}`}
                        strokeLinecap="butt"
                      />
                    );
                    offset += pct;
                    return el;
                  });
                })()}
              </svg>
              <div className={styles.dashRingCenter}>
                <span className={styles.dashRingValue}>{total}</span>
                <span className={styles.dashRingLabel}>events</span>
              </div>
            </div>
            <div className={styles.dashLegend}>
              {(['critical', 'warning', 'info', 'unknown'] as const).map((sev) => (
                <div key={sev} className={styles.dashLegendItem}>
                  <span className={styles.dashLegendDot} style={{ background: SEV_COLOURS[sev] }} />
                  <span className={styles.dashLegendText}>{sev}</span>
                  <span className={styles.dashLegendCount}>{sevCounts[sev]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Bottom row: Live Feed + Top Sources ── */}
        <div className={styles.dashGrid}>
          {/* Live Feed */}
          <div className={styles.dashPanel}>
            <div className={styles.dashPanelHeader}>
              <h3 className={styles.dashPanelTitle}>
                <span className={styles.dashLiveDot} style={{ background: dot.colour }} />
                Live Feed
              </h3>
              <span className={styles.dashFeedMeta}>{dot.label} &middot; Showing latest {feedEvents.length}</span>
            </div>
            <div className={styles.dashFeed}>
              {feedEvents.length === 0 && !loading && (
                <div className={styles.dashFeedEmpty}>No events collected yet. Start the log collector to begin monitoring.</div>
              )}
              {feedEvents.map((ev, idx) => (
                <div key={`${ev.id ?? 'ws'}-${idx}`} className={styles.dashFeedRow}>
                  <span className={styles.dashFeedSev} style={{ color: SEV_COLOURS[ev.severity || 'info'] }}>
                    {(ev.severity || 'info').toUpperCase()}
                  </span>
                  <span className={styles.dashFeedIp}>{ev.src_ip || '—'}</span>
                  <div className={styles.dashFeedBody}>
                    <span className={styles.dashFeedUri}>{ev.uri || ev.command || ev.proc || '—'}</span>
                    {feedExtraAttributes.length > 0 && (
                      <div className={styles.dashFeedAttrs}>
                        {feedExtraAttributes.map((attribute) => (
                          <span key={attribute} className={styles.dashFeedAttr}>
                            <strong>{getAttributeLabel(attribute)}:</strong> {formatLogValue(attribute, ev[attribute], settings.timestampFormat)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <span className={styles.dashFeedTs}>{formatLogValue('timestamp', ev.timestamp, settings.timestampFormat)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Top Source IPs + Top URIs */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 240, maxWidth: 320 }}>
            <div className={styles.dashPanel} style={{ flex: 1 }}>
              <div className={styles.dashPanelHeader}>
                <h3 className={styles.dashPanelTitle}>Top Source IPs</h3>
              </div>
              <div className={styles.dashRankList}>
                {topIPs.length === 0 && <div className={styles.dashFeedEmpty}>No data yet</div>}
                {topIPs.map(([ip, count], i) => (
                  <div key={ip} className={styles.dashRankRow}>
                    <span className={styles.dashRankIdx}>{i + 1}</span>
                    <span className={styles.dashRankLabel}>{ip}</span>
                    <span className={styles.dashRankCount}>{count}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className={styles.dashPanel} style={{ flex: 1 }}>
              <div className={styles.dashPanelHeader}>
                <h3 className={styles.dashPanelTitle}>Top Targeted URIs</h3>
              </div>
              <div className={styles.dashRankList}>
                {topURIs.length === 0 && <div className={styles.dashFeedEmpty}>No data yet</div>}
                {topURIs.map(([uri, { count, severity }], i) => (
                  <div key={uri} className={styles.dashRankRow}>
                    <span className={styles.dashRankIdx}>{i + 1}</span>
                    <span className={styles.dashRankLabel} style={{ color: severity === 'critical' ? '#ff535b' : undefined }}>{uri}</span>
                    <span className={styles.dashRankCount}>{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
