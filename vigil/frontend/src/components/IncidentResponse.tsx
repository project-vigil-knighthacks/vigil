const PLAYBOOKS = [
  {
    title: 'Brute Force Attack (Failed Login Storm)',
    steps: [
      'Confirm alert source and timeframe in the event stream.',
      'Identify targeted account(s) and impacted host(s).',
      'Block source IP (if firewall logs available) or isolate host if needed.',
      'Force password reset / disable account temporarily.',
      'Review successful logins around the same period.',
      'Document incident and tune thresholds if needed.',
    ],
  },
  {
    title: 'Privilege Escalation Attempt',
    steps: [
      'Verify command executed (sudo logs / Windows security logs).',
      'Check if escalation succeeded.',
      'Isolate endpoint if suspicious.',
      'Collect artifacts: logs, process list, user sessions.',
      'Remove unauthorized accounts/permissions and rotate credentials.',
    ],
  },
  {
    title: 'Malware Execution Simulation',
    steps: [
      'Confirm file hash/path/process name.',
      'Quarantine file or remove manually in lab.',
      'Check persistence indicators.',
      'Scan system and validate no additional payloads executed.',
      'Update detection logic if needed.',
    ],
  },
]

export default function IncidentResponse() {
  return (
    <section id="incidents" className="section-card">
      <h2>Incident Response</h2>
      <div className="playbook-list">
        {PLAYBOOKS.map((pb, i) => (
          <details key={i}>
            <summary><strong>{pb.title}</strong></summary>
            <ol>
              {pb.steps.map((step, j) => (
                <li key={j}>{step}</li>
              ))}
            </ol>
          </details>
        ))}
      </div>
    </section>
  )
}
