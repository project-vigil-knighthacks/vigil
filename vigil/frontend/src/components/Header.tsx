export default function Header() {
  return (
    <header className="header">
      <div className="header-top">
        <h1>Vigil</h1>
        <h2 className="header-subtitle">
          Security Information &amp; Event Management
        </h2>
      </div>
      <nav className="nav" aria-label="Primary navigation">
        <a href="#overview">Overview</a>
        <a href="#live">Live Monitoring</a>
        <a href="#alerts">Alerts</a>
        <a href="#dashboards">Dashboards</a>
        <a href="#rules">Correlation Rules</a>
        <a href="#incidents">Incident Response</a>
        <a href="#testing">Testing</a>
        <a href="#reports">Reports</a>
        <a href="#settings">Settings</a>
      </nav>
    </header>
  )
}
