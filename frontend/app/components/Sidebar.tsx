'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import styles from '../siem.module.css';
import { useToast } from './Toast';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000';

const navItems = [
  { href: '/',         label: 'Log Parser', icon: 'terminal' },
  { href: '/events',   label: 'Events',     icon: 'event_note' },
  { href: '/alerts',   label: 'Alerts',     icon: 'notification_important' },
  { href: '/health',   label: 'Health',     icon: 'monitor_heart' },
];

const routeLabels: Record<string, string> = {
  '/':         '/terminal/parser',
  '/events':   '/events',
  '/alerts':   '/alerts',
  '/health':   '/root/system/health',
  '/settings': '/settings',
};

export function Sidebar() {
  const pathname = usePathname();
  const [backendStatus, setBackendStatus] = useState<'connected' | 'disconnected'>('disconnected');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  useEffect(() => {
    fetch(`${API_BASE}/api/health`)
      .then((res) => res.json())
      .then((data) => { if (data.ok) setBackendStatus('connected'); })
      .catch(() => setBackendStatus('disconnected'));
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty('--sidebar-width', sidebarCollapsed ? '88px' : '220px');
  }, [sidebarCollapsed]);

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
      <aside className={`${styles.sidebar} ${mobileOpen ? styles.sidebarOpen : ''} ${sidebarCollapsed ? styles.sidebarCollapsed : ''}`}>
        <div className={styles.logoWrapper}>
          <Image
            src="/images/logo.png"
            alt="Vigil"
            width={64}
            height={64}
            className={styles.logoImage}
            priority
          />
          <div className={styles.logoTextBlock}>
            <span className={styles.logoText}>Vigil</span>
            <span className={styles.logoSubtext}>SIEM Solutions</span>
          </div>
        </div>

        <div className={styles.sidebarControlRow}>
          <button
            type="button"
            className={styles.collapseButton}
            onClick={() => setSidebarCollapsed((v) => !v)}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <span className={`material-symbols-outlined ${styles.collapseButtonIcon}`}>
              {sidebarCollapsed ? 'right_panel_open' : 'right_panel_close'}
            </span>
          </button>
        </div>

        <nav className={styles.nav}>
          {navItems.map(({ href, label, icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setMobileOpen(false)}
              className={`${styles.navLink} ${pathname === href ? styles.navLinkActive : ''}`}
            >
              <span className={`material-symbols-outlined ${styles.navIcon}`}>{icon}</span>
              <span className={styles.navLabel}>{label}</span>
            </Link>
          ))}
        </nav>

        <div className={styles.sidebarFooter}>
          <Link
            href="/settings"
            onClick={() => setMobileOpen(false)}
            className={`${styles.navLink} ${styles.footerSettingsLink} ${pathname === '/settings' ? styles.navLinkActive : ''}`}
          >
            <span className={`material-symbols-outlined ${styles.navIcon}`}>settings</span>
            <span className={styles.navLabel}>Settings</span>
          </Link>
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
          {/* Hamburger: mobile only */}
          <button
            className={styles.hamburger}
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? 'close' : 'menu'}
          </button>

          {/* Logo: mobile only */}
          <div className={styles.topBarLogo}>
            <Image
              src="/images/logo.png"
              alt="Vigil"
              width={48}
              height={48}
              className={styles.topBarLogoImg}
              priority
            />
          </div>

          {/* Route breadcrumb: desktop only */}
          <span className={styles.topBarBreadcrumb}>Route:</span>
          <span className={styles.topBarDivider} />
          <span className={styles.topBarRoute}>{routeLabel}</span>
        </div>

        <div className={styles.topBarRight}>
          <button
            className={`material-symbols-outlined ${styles.topBarIconBtn}`}
            onClick={() => toast('info', 'System time synced', new Date().toLocaleString())}
            aria-label="Time"
          >schedule</button>
          <button
            className={`material-symbols-outlined ${styles.topBarIconBtn}`}
            onClick={() => router.push('/settings')}
            aria-label="Settings"
          >settings</button>
          <button
            className={`material-symbols-outlined ${styles.topBarIconBtn}`}
            onClick={() => toast('success', 'Logged in as admin')}
            aria-label="Account"
          >account_circle</button>
        </div>
      </header>
    </>
  );
}
