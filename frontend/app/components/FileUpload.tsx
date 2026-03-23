'use client';

import { useCallback, useRef, useState } from 'react';
import styles from '../siem.module.css';

interface FileUploadProps {
  onFileSelect: (content: string, filename: string) => void;
  loading?: boolean;
}

const SAMPLE_FILES = [
  { name: 'Attack Logs (auth.log)', path: '/sample-logs/attack.log' },
  { name: 'Apache Access Log', path: '/sample-logs/apache-fake.log' },
  { name: 'Syslog RFC 5424', path: '/sample-logs/syslog-fake.log' },
  { name: 'Syslog Sample', path: '/sample-logs/sample-syslog.log' },
  { name: 'SSH Auth Logs', path: '/sample-logs/sample-auth.log' },
];

export function FileUpload({ onFileSelect, loading }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        onFileSelect(content, file.name);
      };
      reader.readAsText(file);
    },
    [onFileSelect]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleClick = () => {
    inputRef.current?.click();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const loadSampleFile = async (path: string) => {
    try {
      const response = await fetch(path);
      const content = await response.text();
      const filename = path.split('/').pop() || 'sample.log';
      onFileSelect(content, filename);
    } catch (error) {
      console.error('Failed to load sample file:', error);
    }
  };

  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>Upload Log File</h2>
      <div
        className={`${styles.uploadArea} ${isDragging ? styles.uploadAreaDragging : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={handleClick}
      >
        <svg
          className={styles.uploadIcon}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
          />
        </svg>
        <p className={styles.uploadText}>
          {loading ? (
            'Processing...'
          ) : (
            <>
              <span className={styles.uploadTextHighlight}>Click to upload</span> or drag
              and drop
              <br />
              Syslog or text log files (.log, .txt)
            </>
          )}
        </p>
        <input
          ref={inputRef}
          type="file"
          className={styles.uploadInput}
          accept=".log,.txt"
          onChange={handleInputChange}
        />
      </div>
      <div className={styles.sampleDropdownWrapper}>
        <label className={styles.sampleDropdownLabel} htmlFor="sample-select">
          Or load a sample:
        </label>
        <select
          id="sample-select"
          className={styles.sampleDropdown}
          defaultValue=""
          disabled={loading}
          onChange={(e) => {
            if (e.target.value) {
              loadSampleFile(e.target.value);
              e.target.value = '';
            }
          }}
        >
          <option value="" disabled>
            Select a sample log file…
          </option>
          {SAMPLE_FILES.map((sample) => (
            <option key={sample.path} value={sample.path}>
              {sample.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}