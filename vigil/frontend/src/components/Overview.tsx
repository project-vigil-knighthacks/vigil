export default function Overview() {
  return (
    <section id="overview" className="section-card">
      <h2>Overview</h2>
      <div className="grid-2">
        <div className="metric-card">
          <h3>System Status</h3>
          <ul className="metric-list">
            <li>
              SIEM Server
              <span>
                <span className="status-dot status-online" />
                Online
              </span>
            </li>
            <li>
              Log Ingestion
              <span>
                <span className="status-dot status-active" />
                Active
              </span>
            </li>
            <li>
              Agents Connected
              <span id="agentsConnected">—</span>
            </li>
            <li>
              Last Data Update
              <span id="lastUpdate">—</span>
            </li>
          </ul>
        </div>

        <div className="metric-card">
          <h3>Quick Metrics</h3>
          <ul className="metric-list">
            <li>
              Events (Last 15 min)
              <span id="events15m">—</span>
            </li>
            <li>
              Alerts (Last 24 hrs)
              <span id="alerts24h">—</span>
            </li>
            <li>
              Critical Alerts
              <span id="criticalAlerts">—</span>
            </li>
            <li>
              Top Source
              <span id="topSource">—</span>
            </li>
          </ul>
        </div>
      </div>
    </section>
  )
}
