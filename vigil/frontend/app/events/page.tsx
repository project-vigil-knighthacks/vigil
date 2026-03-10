import { Sidebar } from "../components/Sidebar";
import styles from "../siem.module.css";

export default function EventsPage() {
  return (
    <div className={styles.container}>
      <Sidebar />
      <main className={styles.main}>
        <h1 className={styles.pageTitle}>Events</h1>
        <div className={styles.section}>
          <p className={styles.sectionTitle}>Event Stream</p>
          <p style={{ color: "#8b949e", fontSize: "0.875rem" }}>
            Event monitoring coming soon.
          </p>
        </div>
      </main>
    </div>
  );
}
