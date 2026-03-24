'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from '../siem.module.css';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000';

const navItems = [
  { href: '/',        label: 'Log Parser', icon: 'terminal' },
  { href: '/events',  label: 'Events',     icon: 'event_note' },
  { href: '/alerts',  label: 'Alerts',     icon: 'notification_important' },
  { href: '/health',  label: 'Health',     icon: 'monitor_heart' },
];

const routeLabels: Record<string, string> = {
  '/':       '/terminal/parser',
  '/events': '/events',
  '/alerts': '/alerts',
  '/health': '/root/system/health',
};

export function Sidebar() {
  const pathname = usePathname();
  const [backendStatus, setBackendStatus] = useState<'connected' | 'disconnected'>('disconnected');
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/api/health`)
      .then((res) => res.json())
      .then((data) => { if (data.ok) setBackendStatus('connected'); })
      .catch(() => setBackendStatus('disconnected'));
  }, []);

  // Close sidebar on route change (mobile nav tap)
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const routeLabel = routeLabels[pathname] ?? pathname;

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className={styles.overlay}
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`${styles.sidebar} ${mobileOpen ? styles.sidebarOpen : ''}`}>
        <div className={styles.logoWrapper}>
          <Image
            src="/images/logo.png"
            alt="Vigil"
            width={108}
            height={108}
            className={styles.logoImage}
            priority
          />
          <div className={styles.logoTextBlock}>
            <span className={styles.logoText}>igil</span>
            <span className={styles.logoSubtext}>SIEM Solutions</span>
          </div>
        </div>

        <nav className={styles.nav}>
          {navItems.map(({ href, label, icon }) => (
            <Link
              key={href}
              href={href}
              className={`${styles.navLink} ${pathname === href ? styles.navLinkActive : ''}`}
            >
              <span className={`material-symbols-outlined ${styles.navIcon}`}>{icon}</span>
              {label}
            </Link>
          ))}
        </nav>

        <div className={styles.sidebarFooter}>
          <div className={styles.statusFooter}>
            <span
              className={`material-symbols-outlined ${styles.statusIcon} ${
                backendStatus === 'connected'
                  ? styles.statusIconConnected
                  : styles.statusIconDisconnected
              }`}
            >
              sensors
            </span>
            <span className={styles.statusText}>
              {backendStatus === 'connected' ? 'System Live' : 'Disconnected'}
            </span>
          </div>
        </div>
      </aside>

      {/* Top App Bar */}
      <header className={`${styles.topBar} ${mobileOpen ? styles.topBarSidebarOpen : ''}`}>
        <div className={styles.topBarLeft}>
          {/* Hamburger — mobile only */}
          <button
            className={styles.hamburger}
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? 'close' : 'menu'}
          </button>

          {/* Route breadcrumb — desktop only */}
          <span className={styles.topBarBreadcrumb}>Route:</span>
          <span className={styles.topBarDivider} />
          <span className={styles.topBarRoute}>{routeLabel}</span>
        </div>

        <div className={styles.topBarRight}>
          <span className={`material-symbols-outlined ${styles.topBarIconBtn}`}>schedule</span>
          <span className={`material-symbols-outlined ${styles.topBarIconBtn}`}>settings</span>
          <span className={`material-symbols-outlined ${styles.topBarIconBtn}`}>account_circle</span>
        </div>
      </header>
    </>
  );
}
