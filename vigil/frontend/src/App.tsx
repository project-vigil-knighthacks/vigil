import './App.css'
import Header from './components/Header'
import Overview from './components/Overview'
import LiveMonitoring from './components/LiveMonitoring'
import Alerts from './components/Alerts'
import Dashboards from './components/Dashboards'
import CorrelationRules from './components/CorrelationRules'
import IncidentResponse from './components/IncidentResponse'
import Testing from './components/Testing'
import Reports from './components/Reports'
import Settings from './components/Settings'
import Footer from './components/Footer'

function App() {
  return (
    <div className="app">
      <Header />
      <main className="main-content">
        <Overview />
        <LiveMonitoring />
        <Alerts />
        <Dashboards />
        <CorrelationRules />
        <IncidentResponse />
        <Testing />
        <Reports />
        <Settings />
      </main>
      <Footer />
    </div>
  )
}

export default App

