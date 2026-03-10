'use client';

import { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { FileUpload } from './components/FileUpload';
import { LogOutput } from './components/LogOutput';
import type { LogParseResult } from '../types/logs';
import styles from './siem.module.css';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000';

export default function Home() {
  const [result, setResult] = useState<LogParseResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleFileSelect = async (content: string, filename: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/api/logs/parse`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(errData.detail || 'Failed to parse logs');
      }

      const data: LogParseResult = await response.json();
      data.filename = filename;
      setResult(data);
      setSaved(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse logs');
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!result) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/collect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result.logs),
      });
      if (!res.ok) throw new Error('Failed to save');
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save events');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.container}>
      <Sidebar />

      <main className={styles.main}>
        <h1 className={styles.pageTitle}>Log Parser</h1>
        <FileUpload onFileSelect={handleFileSelect} loading={loading} />
        <LogOutput
          result={result}
          error={error}
          loading={loading}
          onSave={result && result.logs.length > 0 ? handleSave : undefined}
          saving={saving}
          saved={saved}
        />
      </main>
    </div>
  );
}

