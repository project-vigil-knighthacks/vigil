"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "../components/Sidebar";
import styles from "../siem.module.css";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

interface HealthResponse {
  ok: boolean;
}

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
        <h1 className={styles.pageTitle}>Health</h1>

        <div className={styles.section}>
          <p className={styles.sectionTitle}>Backend Status</p>

          {loading && (
            <p style={{ color: "#8b949e", fontSize: "0.875rem" }}>Checking backend…</p>
          )}

          {error && (
            <div style={{
              background: "rgba(248, 81, 73, 0.1)",
              border: "1px solid rgba(248, 81, 73, 0.4)",
              borderRadius: "6px",
              padding: "1rem",
              color: "#f85149",
              fontSize: "0.875rem",
            }}>
              <p style={{ fontWeight: 600 }}>Connection failed</p>
              <p style={{ marginTop: "0.25rem", opacity: 0.8 }}>{error}</p>
            </div>
          )}

          {data && (
            <div style={{
              background: "rgba(46, 160, 67, 0.1)",
              border: "1px solid rgba(46, 160, 67, 0.4)",
              borderRadius: "6px",
              padding: "1rem",
              fontSize: "0.875rem",
            }}>
              <p style={{ color: "#3fb950", fontWeight: 600 }}>Backend is reachable</p>
              <pre style={{
                marginTop: "0.75rem",
                color: "#8b949e",
                fontSize: "0.75rem",
                fontFamily: "var(--font-geist-mono)",
              }}>
                {JSON.stringify(data, null, 2)}
              </pre>
            </div>
          )}
        </div>

        <div className={styles.section}>
          <p className={styles.sectionTitle}>Configuration</p>
          <p style={{ fontSize: "0.8125rem", color: "#8b949e" }}>
            API Base:{" "}
            <code style={{ color: "#58a6ff", fontFamily: "var(--font-geist-mono)" }}>
              {API_BASE}
            </code>
          </p>
        </div>
      </main>
    </div>
  );
}
