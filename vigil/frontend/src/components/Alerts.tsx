const PLACEHOLDER_ALERTS = [
  {
    id: 'ALRT-0001',
    time: '—',
    severity: 'Critical',
    rule: 'Brute Force Threshold',
    affected: 'WIN10-LAB / user: admin',
    details: '10+ failed logins in 1 minute',
    status: 'Open',
  },
  {
    id: 'ALRT-0002',
    time: '—',
    severity: 'High',
    rule: 'New Admin Account Created',
    affected: 'WIN10-LAB',
    details: 'Local admin account "tempadmin" created',
    status: 'Open',
  },
]

function SeverityBadge({ level }: { level: string }) {
  return (
    <span className={`badge badge-${level.toLowerCase()}`}>{level}</span>
  )
}

export default function Alerts() {
  return (
    <section id="alerts" className="section-card">
      <h2>Alerts</h2>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
        Alerts triggered by correlation rules and thresholds.
      </p>

      <div className="toolbar">
        <button type="button">Acknowledge Selected</button>
        <button type="button">Export</button>
      </div>

      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>Alert ID</th>
              <th>Time</th>
              <th>Severity</th>
              <th>Rule</th>
              <th>Affected Host / User</th>
              <th>Details</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {PLACEHOLDER_ALERTS.map((a) => (
              <tr key={a.id}>
                <td>
                  <input type="checkbox" name="alertSelect" value={a.id} />
                </td>
                <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{a.id}</td>
                <td>{a.time}</td>
                <td><SeverityBadge level={a.severity} /></td>
                <td>{a.rule}</td>
                <td>{a.affected}</td>
                <td>{a.details}</td>
                <td><span className="badge badge-open">{a.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
