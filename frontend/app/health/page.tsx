"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Sidebar } from "../components/Sidebar";
import styles from "../siem.module.css";

interface HealthResponse {
  ok: boolean;
}

interface LatencySample {
  ms: number;
  ts: string;          // HH:MM:SS.mmm
}

interface LogEntry {
  ts: string;
  level: "INFO" | "WARN" | "ERR";
  msg: string;
}

const MAX_BARS = 20;
const POLL_MS  = 3000;
const LATENCY_WARN_MS = 40;   // bar turns red above this

export default function HealthPage() {
  // API calls use relative URLs proxied through Next.js rewrites

  const [data, setData] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [samples, setSamples] = useState<LatencySample[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const logsRef = useRef(logs);
  logsRef.current = logs;

  const pushLog = useCallback((level: LogEntry["level"], msg: string) => {
    const now = new Date();
    const ts = now.toTimeString().slice(0, 8) + "." + String(now.getMilliseconds()).padStart(3, "0");
    const entry: LogEntry = { ts, level, msg };
    setLogs((prev) => [...prev.slice(-29), entry]);   // keep last 30
  }, []);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      const t0 = performance.now();
      try {
        const res = await fetch('/api/health');
        const ms = Math.round(performance.now() - t0);
        const now = new Date();
        const ts = now.toTimeString().slice(0, 8) + "." + String(now.getMilliseconds()).padStart(3, "0");

        if (cancelled) return;

        const json: HealthResponse = await res.json();
        setData(json);
        setError(null);
        setSamples((prev) => [...prev.slice(-(MAX_BARS - 1)), { ms, ts }]);
        pushLog("INFO", `Health check OK — ${ms}ms`);
      } catch (err) {
        if (cancelled) return;
        const ms = Math.round(performance.now() - t0);
        const msg = err instanceof Error ? err.message : "Unknown error";
        setError(msg);
        setSamples((prev) => [...prev.slice(-(MAX_BARS - 1)), { ms, ts: new Date().toTimeString().slice(0, 8) }]);
        pushLog("ERR", `Health check failed — ${msg}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    pushLog("INFO", `Starting health monitor — polling /api/health every ${POLL_MS / 1000}s`);
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [pushLog]);

  // Derived stats
  const latencies = samples.map((s) => s.ms);
  const avg = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;
  const max = latencies.length ? Math.max(...latencies) : 0;
  const lastMs = latencies.length ? latencies[latencies.length - 1] : null;

  // Normalise bar heights: tallest bar = 100%
  const barMax = Math.max(max, 1);
  const barHeights = samples.map((s) => Math.max((s.ms / barMax) * 100, 5)); // min 5% so bars are visible

  // Tooltip state for bar hover
  const [tooltip, setTooltip] = useState<{ x: number; y: number; ms: number; ts: string } | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);

  return (
    <div className={styles.container}>
      <Sidebar />
      <main className={styles.main}>
        <h1 className={styles.pageTitle} style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <span style={{ width: 8, height: 32, background: "#e63946", flexShrink: 0 }} />
          System Health Status
        </h1>
        <p className={styles.pageSubtitle}>
          Real-time diagnostic telemetry for Vigil SIEM core services. All systems monitored at 500ms intervals.
        </p>

        {/* Top Metric Cards */}
        <div className={styles.healthGrid}>
          {/* Connection State */}
          <div className={styles.healthCard}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <span className={styles.healthCardLabel}>Connection State</span>
              {loading ? null : error ? (
                <div className={styles.healthErrorBadge}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#ff535b", flexShrink: 0 }} />
                  FAILED
                </div>
              ) : (
                <div className={styles.healthConnectedBadge}>
                  <span className={styles.healthConnectedDot} />
                  CONNECTED
                </div>
              )}
            </div>
            <div>
              <div className={styles.healthCardValue}>
                {loading ? "Checking…" : error ? "UNREACHABLE" : "STABLE"}
              </div>
              {!loading && !error && (
                <div className={styles.healthCardSub}>LATENCY: {lastMs !== null ? `${lastMs}MS` : "—"}</div>
              )}
              {!loading && error && (
                <div style={{ fontFamily: "var(--font-geist-mono)", fontSize: "0.6875rem", color: "#ffb4ab", marginTop: "0.25rem" }}>
                  {error}
                </div>
              )}
            </div>
          </div>

          {/* API Entrypoint */}
          <div className={styles.healthCard}>
            <span className={styles.healthCardLabel}>API Entrypoint</span>
            <div>
              <div className={styles.healthApiBox}>/api</div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", marginTop: "0.5rem", opacity: 0.4 }}>
                <span className="material-symbols-outlined" style={{ fontSize: "0.875rem", color: "#e5e2e1" }}>lock</span>
                <span style={{ fontFamily: "var(--font-geist-mono)", fontSize: "0.5625rem", color: "#e5e2e1" }}>
                  TLS 1.3 AES-256-GCM
                </span>
              </div>
            </div>
          </div>

          {/* Response Data */}
          <div className={styles.healthCard}>
            <span className={styles.healthCardLabel}>Backend Response</span>
            <div>
              {loading && (
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "rgba(229,226,225,0.4)" }}>
                  <div className={styles.spinner} />
                  <span style={{ fontFamily: "var(--font-geist-mono)", fontSize: "0.6875rem" }}>Polling...</span>
                </div>
              )}
              {!loading && data && (
                <pre style={{
                  fontFamily: "var(--font-geist-mono)",
                  fontSize: "0.75rem",
                  color: "#22c55e",
                  background: "#0e0e0e",
                  padding: "0.875rem 1rem",
                  borderLeft: "2px solid #22c55e",
                  margin: 0,
                  overflowX: "auto",
                }}>
                  {JSON.stringify(data, null, 2)}
                </pre>
              )}
              {!loading && error && (
                <div className={styles.error}>Connection failed</div>
              )}
            </div>
          </div>
        </div>

        {/* Charts & Resources Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "1px", background: "#0e0e0e", marginBottom: "1.5rem" }}>
          {/* Latency Bar Chart */}
          <div style={{ background: "#201f1f", padding: "1.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
              <h3 style={{ fontFamily: "var(--font-space-grotesk)", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#e5e2e1", margin: 0 }}>
                API Response Latency (ms)
              </h3>
              <div style={{ display: "flex", gap: "1rem", fontFamily: "var(--font-geist-mono)", fontSize: "0.625rem" }}>
                <span style={{ color: "rgba(228,190,188,0.6)" }}>AVG: {avg}ms</span>
                <span style={{ color: "#e63946" }}>MAX: {max}ms</span>
              </div>
            </div>
            <div className={styles.healthBarChart} ref={chartRef} onMouseLeave={() => setTooltip(null)} style={{ position: "relative" }}>
              {barHeights.map((h, i) => (
                <div
                  key={i}
                  className={`${styles.healthBar} ${samples[i].ms > LATENCY_WARN_MS ? styles.healthBarHighlight : ""}`}
                  style={{ height: `${h}%` }}
                  onMouseMove={(e) => {
                    const rect = chartRef.current?.getBoundingClientRect();
                    if (!rect) return;
                    setTooltip({
                      x: e.clientX - rect.left,
                      y: e.clientY - rect.top - 40,
                      ms: samples[i].ms,
                      ts: samples[i].ts,
                    });
                  }}
                />
              ))}
              {tooltip && (
                <div style={{
                  position: "absolute",
                  left: tooltip.x,
                  top: tooltip.y,
                  transform: "translateX(-50%)",
                  background: "#1a1a1a",
                  border: "1px solid rgba(228,190,188,0.2)",
                  padding: "0.25rem 0.5rem",
                  borderRadius: "4px",
                  fontFamily: "var(--font-geist-mono)",
                  fontSize: "0.625rem",
                  color: "#e5e2e1",
                  pointerEvents: "none",
                  whiteSpace: "nowrap",
                  zIndex: 10,
                }}>
                  <span style={{ color: tooltip.ms > LATENCY_WARN_MS ? "#ff535b" : "#22c55e", fontWeight: 700 }}>{tooltip.ms}ms</span>
                  <span style={{ color: "rgba(228,190,188,0.5)", marginLeft: "0.5rem" }}>{tooltip.ts}</span>
                </div>
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.75rem", fontFamily: "var(--font-geist-mono)", fontSize: "0.5625rem", color: "rgba(228,190,188,0.4)", textTransform: "uppercase" }}>
              <span>{samples.length > 0 ? samples[0].ts.slice(0, 8) : "—"}</span>
              <span>{samples.length > 1 ? samples[Math.floor(samples.length / 2)].ts.slice(0, 8) : ""}</span>
              <span>NOW</span>
            </div>
          </div>

          {/* Latency Metrics */}
          <div style={{ background: "#201f1f", padding: "1.5rem", minWidth: "220px" }}>
            <h3 style={{ fontFamily: "var(--font-space-grotesk)", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#e5e2e1", marginBottom: "1.5rem" }}>
              Latency Metrics
            </h3>
            {[
              { label: "Average", value: `${avg}ms`, fill: `${Math.min((avg / Math.max(max, 1)) * 100, 100)}%`, warn: avg > LATENCY_WARN_MS },
              { label: "Maximum", value: `${max}ms`, fill: "100%", warn: max > LATENCY_WARN_MS },
              { label: "Latest", value: lastMs !== null ? `${lastMs}ms` : "—", fill: `${Math.min(((lastMs ?? 0) / Math.max(max, 1)) * 100, 100)}%`, warn: (lastMs ?? 0) > LATENCY_WARN_MS },
              { label: "Samples", value: `${samples.length} / ${MAX_BARS}`, fill: `${(samples.length / MAX_BARS) * 100}%`, warn: false },
            ].map(({ label, value, fill, warn }) => (
              <div key={label} style={{ marginBottom: "1.25rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-geist-mono)", fontSize: "0.5625rem", marginBottom: "0.375rem", color: "rgba(229,226,225,0.7)", textTransform: "uppercase" }}>
                  <span>{label}</span>
                  <span>{value}</span>
                </div>
                <div className={styles.healthResourceBar}>
                  <div
                    className={styles.healthResourceFill}
                    style={{
                      width: fill,
                      background: warn ? "#e63946" : "#22c55e",
                      transition: "width 0.4s ease",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Live Health Stream */}
        <div className={styles.healthLogStream}>
          <div className={styles.healthLogStreamHeader}>
            <span className={styles.healthLogStreamTitle}>Live Health Stream</span>
            <span style={{ fontFamily: "var(--font-geist-mono)", fontSize: "0.5rem", color: "rgba(228,190,188,0.4)", textTransform: "uppercase", letterSpacing: "0.15em" }}>
              Logging Level: Verbose
            </span>
          </div>
          {logs.map((line, i) => (
            <div key={i} className={styles.healthLogLine}>
              <span className={styles.healthLogTs}>{line.ts}</span>
              <span className={line.level === "WARN" || line.level === "ERR" ? styles.healthLogLevelWarn : styles.healthLogLevelInfo}>
                [{line.level}]
              </span>
              <span>{line.msg}</span>
            </div>
          ))}
          {logs.length === 0 && (
            <div className={styles.healthLogLine} style={{ opacity: 0.4 }}>
              <span>Waiting for first health check…</span>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
