const ATTACK_SIMULATIONS = [
  '10+ failed login attempts in 1 minute',
  'Login from unusual user account',
  'New admin account creation',
  'Linux sudo escalation attempt',
  'Port scan simulation',
  'Suspicious process execution',
]

export default function Testing() {
  return (
    <section id="testing" className="section-card">
      <h2>Testing Plan</h2>
      <div className="metric-card">
        <h3>Attack Simulation Checklist</h3>
        <ul className="checklist">
          {ATTACK_SIMULATIONS.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      </div>
    </section>
  )
}
