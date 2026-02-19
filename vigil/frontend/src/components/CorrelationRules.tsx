import { useState } from 'react'

type Severity = 'critical' | 'high' | 'medium' | 'low'
type Status = 'enabled' | 'disabled'

interface Rule {
  name: string
  description: string
  threshold: string
  severity: Severity
  status: Status
}

const INITIAL_RULES: Rule[] = [
  {
    name: 'Brute Force Threshold',
    description: 'Trigger if 10+ failed logins occur in 1 minute',
    threshold: '10 / 1 min',
    severity: 'critical',
    status: 'enabled',
  },
  {
    name: 'Privilege Escalation Attempt',
    description: 'Detect suspicious sudo / admin group changes',
    threshold: 'Any',
    severity: 'high',
    status: 'enabled',
  },
  {
    name: 'Network Scan Detection',
    description: 'Detect port scanning patterns (e.g., nmap)',
    threshold: '20+ ports / short window',
    severity: 'medium',
    status: 'enabled',
  },
  {
    name: 'Suspicious Process Execution',
    description: 'Flag known "test malware" indicators or suspicious binaries',
    threshold: 'Any',
    severity: 'high',
    status: 'enabled',
  },
  {
    name: 'Test Rule (Disabled Example)',
    description: 'Example disabled rule for filtering demo',
    threshold: '—',
    severity: 'low',
    status: 'disabled',
  },
]

function SeverityBadge({ level }: { level: string }) {
  return <span className={`badge badge-${level.toLowerCase()}`}>{level}</span>
}

function StatusBadge({ value }: { value: string }) {
  return <span className={`badge badge-${value.toLowerCase()}`}>{value}</span>
}

export default function CorrelationRules() {
  const [rules, setRules] = useState<Rule[]>(INITIAL_RULES)
  const [search, setSearch] = useState('')
  const [severityFilter, setSeverityFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [form, setForm] = useState({
    name: '',
    description: '',
    threshold: '',
    severity: 'medium' as Severity,
    status: 'enabled' as Status,
  })

  const filtered = rules.filter((r) => {
    const matchesSearch =
      search === '' ||
      [r.name, r.description, r.threshold, r.severity, r.status]
        .join(' ')
        .toLowerCase()
        .includes(search.toLowerCase())
    const matchesSeverity = severityFilter === 'all' || r.severity === severityFilter
    const matchesStatus = statusFilter === 'all' || r.status === statusFilter
    return matchesSearch && matchesSeverity && matchesStatus
  })

  function handleAddRule() {
    if (!form.name.trim()) return
    setRules((prev) => [...prev, { ...form }])
    setForm({ name: '', description: '', threshold: '', severity: 'medium', status: 'enabled' })
  }

  return (
    <section id="rules" className="section-card">
      <h2>Correlation Rules</h2>

      {/* Filter toolbar */}
      <div className="metric-card" style={{ marginBottom: '1rem' }}>
        <h3>Filter Rules</h3>
        <div className="toolbar">
          <label htmlFor="ruleSearch">Search:</label>
          <input
            id="ruleSearch"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, description, severity, status..."
            style={{ minWidth: '260px' }}
          />
          <label htmlFor="ruleSeverityFilter">Severity:</label>
          <select
            id="ruleSeverityFilter"
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
          >
            <option value="all">All</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
          <label htmlFor="ruleStatusFilter">Status:</label>
          <select
            id="ruleStatusFilter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All</option>
            <option value="enabled">Enabled</option>
            <option value="disabled">Disabled</option>
          </select>
          <button
            type="button"
            onClick={() => {
              setSearch('')
              setSeverityFilter('all')
              setStatusFilter('all')
            }}
          >
            Clear
          </button>
          <div className="toolbar-spacer" />
          <span className="rules-counter">
            Showing {filtered.length} of {rules.length} rules
          </span>
        </div>
      </div>

      {/* Rules table */}
      <div className="table-wrapper" style={{ marginBottom: '1.25rem' }}>
        <table>
          <thead>
            <tr>
              <th>Rule Name</th>
              <th>Description</th>
              <th>Threshold</th>
              <th>Severity</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 500 }}>{r.name}</td>
                <td style={{ color: 'var(--text-muted)' }}>{r.description}</td>
                <td>{r.threshold}</td>
                <td><SeverityBadge level={r.severity} /></td>
                <td><StatusBadge value={r.status} /></td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                  No rules match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add rule form */}
      <div className="metric-card">
        <h3>Add / Tune Rule</h3>
        <div className="form-grid">
          <div className="form-field">
            <label htmlFor="ruleName">Rule Name</label>
            <input
              id="ruleName"
              type="text"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="e.g., Unusual Login Location"
            />
          </div>
          <div className="form-field">
            <label htmlFor="ruleThreshold">Threshold</label>
            <input
              id="ruleThreshold"
              type="text"
              value={form.threshold}
              onChange={(e) => setForm((p) => ({ ...p, threshold: e.target.value }))}
              placeholder="e.g., 5 events / 2 minutes"
            />
          </div>
          <div className="form-field">
            <label htmlFor="ruleSeverity">Severity</label>
            <select
              id="ruleSeverity"
              value={form.severity}
              onChange={(e) => setForm((p) => ({ ...p, severity: e.target.value as Severity }))}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="ruleStatus">Status</label>
            <select
              id="ruleStatus"
              value={form.status}
              onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as Status }))}
            >
              <option value="enabled">Enabled</option>
              <option value="disabled">Disabled</option>
            </select>
          </div>
          <div className="form-field" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="ruleDesc">Description</label>
            <textarea
              id="ruleDesc"
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              placeholder="What does this rule detect?"
            />
          </div>
        </div>
        <div className="form-actions">
          <button type="button" className="btn-primary" onClick={handleAddRule}>
            Add Rule
          </button>
          <button
            type="button"
            onClick={() =>
              setForm({ name: '', description: '', threshold: '', severity: 'medium', status: 'enabled' })
            }
          >
            Clear
          </button>
        </div>
      </div>
    </section>
  )
}
