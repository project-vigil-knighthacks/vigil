const PLACEHOLDER_EVENTS = [
  {
    time: '—',
    host: 'WIN10-LAB',
    source: 'Windows Event Log',
    type: 'Authentication',
    severity: 'Medium',
    summary: 'Failed login attempt',
  },
  {
    time: '—',
    host: 'UBU-SERVER',
    source: '/var/log/auth.log',
    type: 'Privilege',
    severity: 'High',
    summary: 'sudo attempt by user "student"',
  },
]

function SeverityBadge({ level }: { level: string }) {
  return (
    <span className={`badge badge-${level.toLowerCase()}`}>{level}</span>
  )
}

export default function LiveMonitoring() {
  return (
    <section id="live" className="section-card">
      <h2>Live Monitoring</h2>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
        Latest security events arriving from Windows, Linux, and optional web/firewall sources.
      </p>

      <div className="toolbar">
        <label htmlFor="liveFilter">Filter:</label>
        <select id="liveFilter" name="liveFilter">
          <option value="all">All</option>
          <option value="auth">Authentication</option>
          <option value="malware">Malware</option>
          <option value="network">Network</option>
          <option value="system">System</option>
        </select>
        <div className="toolbar-spacer" />
        <button type="button">Refresh</button>
      </div>

      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Host</th>
              <th>Source</th>
              <th>Event Type</th>
              <th>Severity</th>
              <th>Summary</th>
            </tr>
          </thead>
          <tbody>
            {PLACEHOLDER_EVENTS.map((e, i) => (
              <tr key={i}>
                <td>{e.time}</td>
                <td>{e.host}</td>
                <td>{e.source}</td>
                <td>{e.type}</td>
                <td><SeverityBadge level={e.severity} /></td>
                <td>{e.summary}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
