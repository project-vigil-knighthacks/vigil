export default function Dashboards() {
  return (
    <section id="dashboards" className="section-card">
      <h2>Dashboards</h2>
      <div className="grid-3">

        <div className="metric-card">
          <h3>Authentication Activity</h3>
          <ul className="metric-list">
            <li>Total logins (24h) <span id="authTotal">—</span></li>
            <li>Failed logins (24h) <span id="authFailed">—</span></li>
            <li>Top users by failures <span id="authTopUsers">—</span></li>
            <li>Anomalies detected <span id="authAnomalies">—</span></li>
          </ul>
        </div>

        <div className="metric-card">
          <h3>Top Alerts</h3>
          <ol style={{ paddingLeft: '1.25rem', margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 2 }}>
            <li><span id="topAlert1">Brute force</span></li>
            <li><span id="topAlert2">Privilege escalation</span></li>
            <li><span id="topAlert3">Port scanning</span></li>
          </ol>
        </div>

        <div className="metric-card">
          <h3>System Health</h3>
          <ul className="metric-list">
            <li>CPU <span id="healthCpu">—</span></li>
            <li>RAM <span id="healthRam">—</span></li>
            <li>Disk <span id="healthDisk">—</span></li>
            <li>Ingestion latency <span id="healthLatency">—</span></li>
          </ul>
        </div>

      </div>
    </section>
  )
}
