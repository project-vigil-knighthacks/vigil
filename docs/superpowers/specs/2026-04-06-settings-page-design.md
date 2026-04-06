# Settings Page Design

**Date:** 2026-04-06
**Status:** Approved

## Overview

A dedicated `/settings` route with a left-tab panel layout. All settings are stored in `localStorage` via a `SettingsProvider` context that wraps the entire app. Changes are staged locally and only committed on Save.

## Architecture

### `SettingsContext` (`frontend/app/contexts/SettingsContext.tsx`)

- Defines the `Settings` type and default values
- Reads from `localStorage` on mount, falls back to defaults
- Exposes `settings`, `setSetting(key, value)`, `save()`, `reset()`
- `save()` writes staged state to `localStorage` and returns to committed state
- `reset()` reverts staged state to defaults without persisting

### `SettingsProvider` wired into `frontend/app/layout.tsx`

Wraps the app so all pages can read settings via `useSettings()`.

### `frontend/app/settings/page.tsx`

The settings page itself. Uses the left-tab panel layout:
- 180px left tab nav with icons
- Content pane on the right showing the active tab's fields
- Save / Reset footer bar

## Settings Schema

```ts
interface Settings {
  // Connection
  apiBaseUrl: string;           // default: 'http://localhost:8000'
  pollingInterval: number;      // default: 30 (seconds)
  autoReconnect: boolean;       // default: true
  connectionTimeout: number;    // default: 5000 (ms)

  // Notifications
  toastsEnabled: boolean;       // default: true
  alertOnCritical: boolean;     // default: true

  // Display
  rowSpacing: 'tight' | 'standard' | 'relaxed'; // default: 'standard'
  timestampFormat: 'iso' | 'relative' | 'local'; // default: 'iso'

  // Profile
  username: string;             // default: 'admin'
  role: 'administrator' | 'analyst' | 'readonly'; // default: 'administrator'
}
```

## Tabs

### Connection
| Field | Control | Description |
|---|---|---|
| API Base URL | Text input | Overrides backend endpoint across the app at runtime |
| Polling Interval | Number input (seconds) | How often live data refreshes |
| Auto-reconnect | Toggle | Retry connection on disconnect |
| Connection Timeout | Number input (ms) | Max wait before marking backend unreachable |

### Notifications
| Field | Control | Description |
|---|---|---|
| Toast Notifications | Toggle | Disables all toasts when off |
| Alert on Critical Events | Toggle | Fires a toast when the alerts page fetches and finds critical-severity rows |

### Display
| Field | Control | Description |
|---|---|---|
| Row Spacing | Segmented visual picker (Tight / Standard / Relaxed) | Applies CSS variable read by log/event tables |
| Timestamps | Select (ISO 8601 / Relative / Local) | Timestamp display format across all tables |

### Profile
| Field | Control | Description |
|---|---|---|
| Username | Text input | Display name shown in top bar |
| Role | Select (Administrator / Analyst / Read-only) | Access level label |

## Row Spacing Implementation

`rowSpacing` maps to a CSS variable `--table-row-padding` set on `<body>` by `SettingsProvider`:

| Value | `--table-row-padding` |
|---|---|
| tight | 0.25rem 0.75rem |
| standard | 0.5rem 0.75rem |
| relaxed | 0.875rem 0.75rem |

All `td` elements in log/event tables use `padding: var(--table-row-padding)`.

## Toast Integration

- `toastsEnabled: false` causes `useToast().toast()` to be a no-op
- Save → success toast: `"Settings saved"`
- Validation error (e.g. empty API URL) → error toast: `"Invalid value for <field>"`
- Reset → info toast: `"Settings reset to defaults"`

## Sidebar Nav

Add Settings entry to `navItems` in `Sidebar.tsx`:
```ts
{ href: '/settings', label: 'Settings', icon: 'settings' }
```

The `settings` icon button in the top bar navigates to `/settings` instead of firing a warning toast.

## Validation

- API Base URL: must be non-empty and a valid URL (starts with `http://` or `https://`)
- Polling Interval: integer between 5 and 300
- Connection Timeout: integer between 1000 and 30000
- Username: non-empty, max 32 chars

Invalid fields are highlighted with a red border. Save is blocked until all fields are valid.

## Files Changed / Created

| File | Change |
|---|---|
| `frontend/app/contexts/SettingsContext.tsx` | New — context, provider, hook |
| `frontend/app/settings/page.tsx` | New — settings page |
| `frontend/app/layout.tsx` | Wrap with `SettingsProvider` |
| `frontend/app/components/Sidebar.tsx` | Add Settings nav item, wire settings icon to `/settings` |
| `frontend/app/siem.module.css` | Add settings page styles, `--table-row-padding` CSS var usage |
