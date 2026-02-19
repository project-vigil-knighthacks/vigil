import { useState } from 'react'

interface Source {
  id: string
  label: string
  optional?: boolean
  checked: boolean
}

const INITIAL_SOURCES: Source[] = [
  { id: 'srcWindows', label: 'Windows Event Logs', checked: true },
  { id: 'srcLinux', label: 'Linux auth.log / syslog', checked: true },
  { id: 'srcFirewall', label: 'Firewall Logs', optional: true, checked: false },
  { id: 'srcWeb', label: 'Web Server Logs', optional: true, checked: false },
]

export default function Settings() {
  const [sources, setSources] = useState<Source[]>(INITIAL_SOURCES)
  const [saved, setSaved] = useState(false)

  function toggleSource(id: string) {
    setSources((prev) =>
      prev.map((s) => (s.id === id ? { ...s, checked: !s.checked } : s))
    )
    setSaved(false)
  }

  function handleSave() {
    setSaved(true)
  }

  return (
    <section id="settings" className="section-card">
      <h2>Settings</h2>
      <div className="metric-card">
        <h3>Log Sources</h3>
        <div className="sources-list">
          {sources.map((s) => (
            <label key={s.id} className="source-item">
              <input
                type="checkbox"
                id={s.id}
                checked={s.checked}
                onChange={() => toggleSource(s.id)}
              />
              {s.label}
              {s.optional && (
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  (optional)
                </span>
              )}
            </label>
          ))}
        </div>
        <button type="button" className="btn-primary" onClick={handleSave}>
          Save Sources
        </button>
        {saved && (
          <span style={{ marginLeft: '0.75rem', fontSize: '0.82rem', color: 'var(--sev-low)' }}>
            Saved.
          </span>
        )}
      </div>
    </section>
  )
}
