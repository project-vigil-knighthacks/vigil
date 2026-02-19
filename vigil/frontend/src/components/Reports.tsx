import { useState } from 'react'

export default function Reports() {
  const [output, setOutput] = useState<string | null>(null)

  function handleGenerate() {
    setOutput('Report generation will be available once connected to the backend.')
  }

  return (
    <section id="reports" className="section-card">
      <h2>Reports</h2>
      <div className="metric-card">
        <h3>Generate Report</h3>
        <div className="form-grid">
          <div className="form-field">
            <label htmlFor="reportRange">Time Range</label>
            <select id="reportRange" name="reportRange">
              <option value="24h">Last 24 hours</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="custom">Custom</option>
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="reportType">Report Type</label>
            <select id="reportType" name="reportType">
              <option value="summary">Executive Summary</option>
              <option value="alerts">Alert Breakdown</option>
              <option value="auth">Authentication Report</option>
              <option value="systems">Systems / Health Report</option>
            </select>
          </div>
        </div>
        <div className="form-actions">
          <button type="button" className="btn-primary" onClick={handleGenerate}>
            Generate
          </button>
        </div>
        <div className="report-output">
          {output ?? 'Report output will appear here.'}
        </div>
      </div>
    </section>
  )
}
