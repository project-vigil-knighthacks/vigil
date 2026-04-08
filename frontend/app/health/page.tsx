"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "../components/Sidebar";
import styles from "../siem.module.css";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

interface HealthResponse {
  ok: boolean;
}

const BAR_HEIGHTS = [20, 25, 22, 35, 30, 28, 60, 40, 35, 25, 22, 20, 25, 85, 45, 30, 32, 25, 22, 28];
const HIGHLIGHT_BARS = [6, 13];

const LOG_LINES = [
  { ts: "14:22:01.002", level: "INFO",  msg: "Heartbeat received from Node-Alpha-01" },
  { ts: "14:22:01.458", level: "INFO",  msg: "Database connection pool verified (32/100 active)" },
  { ts: "14:22:01.991", level: "INFO",  msg: "API Gateway status: 200 OK" },
  { ts: "14:22:02.312", level: "WARN",  msg: "Disk I/O spike detected on storage cluster B" },
  { ts: "14:22:03.001", level: "INFO",  msg: "Health check cycle complete. No critical errors." },
  { ts: "14:22:03.555", level: "INFO",  msg: "Peer connection re-established: Node-Gamma-12" },
];

export default function HealthPage() {
  const [data, setData] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/api/health`)
      .then((res) => res.json())
      .then((json) => setData(json))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Unknown error");
      })
      .finally(() => setLoading(false));
  }, []);

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
                <div className={styles.healthCardSub}>LATENCY: &lt; 50MS</div>
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
              <div className={styles.healthApiBox}>{API_BASE}</div>
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
                <span style={{ color: "rgba(228,190,188,0.6)" }}>AVG: 12ms</span>
                <span style={{ color: "#e63946" }}>MAX: 44ms</span>
              </div>
            </div>
            <div className={styles.healthBarChart}>
              {BAR_HEIGHTS.map((h, i) => (
                <div
                  key={i}
                  className={`${styles.healthBar} ${HIGHLIGHT_BARS.includes(i) ? styles.healthBarHighlight : ""}`}
                  style={{ height: `${h}%`, animationDelay: `${i * 0.1}s` }}
                />
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.75rem", fontFamily: "var(--font-geist-mono)", fontSize: "0.5625rem", color: "rgba(228,190,188,0.4)", textTransform: "uppercase" }}>
              <span>T-60MIN</span>
              <span>T-30MIN</span>
              <span>NOW</span>
            </div>
          </div>

          {/* Host Resources */}
          <div style={{ background: "#201f1f", padding: "1.5rem", minWidth: "220px" }}>
            <h3 style={{ fontFamily: "var(--font-space-grotesk)", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#e5e2e1", marginBottom: "1.5rem" }}>
              Host Resources
            </h3>
            {[
              { label: "CPU Load", value: "14.2%", fill: "14.2%" },
              { label: "Memory", value: "4.8GB / 32GB", fill: "15%" },
              { label: "Storage", value: "842GB / 2TB", fill: "42%", muted: true },
            ].map(({ label, value, fill, muted }) => (
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
                      background: muted ? "rgba(228,190,188,0.5)" : "#e63946",
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
          {LOG_LINES.map((line, i) => (
            <div key={i} className={styles.healthLogLine}>
              <span className={styles.healthLogTs}>{line.ts}</span>
              <span className={line.level === "WARN" ? styles.healthLogLevelWarn : styles.healthLogLevelInfo}>
                [{line.level}]
              </span>
              <span>{line.msg}</span>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
