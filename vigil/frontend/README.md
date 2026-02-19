# Frontend - Vigil SIEM Dashboard

![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![ESLint](https://img.shields.io/badge/ESLint-4B32C3?style=for-the-badge&logo=eslint&logoColor=white)

React + TypeScript + Vite. Renders the Vigil SIEM dashboard UI.<br>
Original HTML template developed by `@thangsauce`, React/TS UI developed by `@zaynedoc`.

## Directory Structure

```
frontend/
├── public/
│   └── vite.svg                  # Static assets served as-is (favicon placeholder) <- adjust for future logo revisions
│
├── archive/                      # Outline files made by @thangsauce
│   ├── outline_index.html        # Original HTML outline for dashboard
│   └── rules_filter.js           # Original JS filter rules 
│
├── src/
│   ├── components/
│   │   ├── Header.tsx            # Header for logo, nav links, etc.
│   │   ├── Footer.tsx            # Footer
│   │   ├── Overview.tsx          # System status indicators and quick metrics (events, alerts)
│   │   ├── LiveMonitoring.tsx    # Filterable table of incoming security events in real time
│   │   ├── Alerts.tsx            # Active alerts queue with severity badges and acknowledge actions
│   │   ├── Dashboards.tsx        # Summary cards: auth activity, top alerts, system health
│   │   ├── CorrelationRules.tsx  # Rule table with live search/filter and an add-rule form
│   │   ├── IncidentResponse.tsx  # Collapsible playbooks for brute force, escalation, malware
│   │   ├── Testing.tsx           # Attack simulation checklist for lab validation
│   │   ├── Reports.tsx           # Report generator form (time range + report type)
│   │   └── Settings.tsx          # Toggle log sources (Windows, Linux, Firewall, Web)
│   │
│   ├── App.tsx                   # Root component
│   ├── App.css                   # CSS
│   ├── index.css                 # More CSS; colours, spacing, base resets
│   └── main.tsx                  # React entry point.. mounts <App /> into #root
|
|   # Note from Zayne:
|   # Everything below just came with the program when I installed did npm install
|   # I just asked Copilot to comment the file descriptions below, not idea what they did til now
|
├── index.html                    # Vite HTML shell — contains the #root div
├── vite.config.ts                # Vite build config (React plugin, dev server settings)
├── tsconfig.json                 # Base TypeScript config (references app + node configs)
├── tsconfig.app.json             # TS config for src/ files
├── tsconfig.node.json            # TS config for Vite config and build tooling
├── eslint.config.js              # ESLint rules for TypeScript + React
├── package.json                  # Dependencies and npm scripts
└── package-lock.json             # Locked dependency tree
```

## Local Environment

```bash
cd vigil\frontend
npm install
npm run dev
```
