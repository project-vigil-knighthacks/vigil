'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from '../siem.module.css';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000';

const navItems = [
  { href: '/', label: 'Log Parser' },
  { href: '/events', label: 'Events' },
  { href: '/alerts', label: 'Alerts' },
  { href: '/health', label: 'Health' },
];

export function Sidebar() {
  const pathname = usePathname();
  const [backendStatus, setBackendStatus] = useState<'connected' | 'disconnected'>('disconnected');

  useEffect(() => {
    fetch(`${API_BASE}/api/health`)
      .then((res) => res.json())
      .then((data) => { if (data.ok) setBackendStatus('connected'); })
      .catch(() => setBackendStatus('disconnected'));
  }, []);

  return (
    <aside className={styles.sidebar}>
      <div className={styles.logoWrapper}>
        <Image
          src="/images/logo.jpg"
          alt="Vigil"
          width={36}
          height={36}
          className={styles.logoImage}
          priority
        />
        <span className={styles.logoText}>Vigil SIEM</span>
      </div>

      <nav className={styles.nav}>
        {navItems.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={`${styles.navLink} ${pathname === href ? styles.navLinkActive : ''}`}
          >
            {label}
          </Link>
        ))}
      </nav>

      <div className={`${styles.sidebarFooter} ${styles.status}`}>
        <span
          className={`${styles.statusDot} ${
            backendStatus === 'connected' ? styles.statusConnected : styles.statusDisconnected
          }`}
        />
        Backend {backendStatus}
      </div>
    </aside>
  );
}
