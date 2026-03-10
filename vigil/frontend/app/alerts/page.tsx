import { Sidebar } from "../components/Sidebar";
import styles from "../siem.module.css";

export default function AlertsPage() {
  return (
    <div className={styles.container}>
      <Sidebar />
      <main className={styles.main}>
        <h1 className={styles.pageTitle}>Alerts</h1>
        <div className={styles.section}>
          <p className={styles.sectionTitle}>Active Alerts</p>
          <p style={{ color: "#8b949e", fontSize: "0.875rem" }}>
            Alert management coming soon.
          </p>
        </div>
      </main>
    </div>
  );
}
