import type { ParsedLog } from '../../types/logs';
import type { Settings } from '../contexts/SettingsContext';

export const REQUIRED_LOG_ATTRIBUTES = [
  'timestamp',
  'severity',
  'src_ip',
  'uri',
] as const;

const INTERNAL_ATTRIBUTES = new Set([
  'id',
  'unmatched',
  'extra_attrs',
]);

const EXCLUDED_FROM_PICKER = new Set([
  ...REQUIRED_LOG_ATTRIBUTES,
  'raw',
]);

const PRIORITY_ATTRIBUTES = [
  'http_method',
  'status_code',
  'bytes_sent',
  'bytes_recv',
  'login',
  'login_status',
  'user_id',
  'target_user',
  'auth_method',
  'host',
  'proc',
  'pid',
  'command',
  'args',
  'request_id',
  'session_id',
  'trace_id',
  'dst_ip',
  'dst_port',
  'src_port',
  'url',
  'domain',
  'path',
  'duration',
  'tty',
  'pwd',
  'facility',
  'hash',
  'hash_algo',
  'signature',
];

const ATTRIBUTE_LABELS: Record<string, string> = {
  src_ip: 'Source IP',
  dst_ip: 'Destination IP',
  src_port: 'Source Port',
  dst_port: 'Destination Port',
  uri: 'URI',
  url: 'URL',
  http_method: 'HTTP Method',
  user_id: 'User ID',
  target_user: 'Target User',
  auth_method: 'Auth Method',
  login_status: 'Login Status',
  status_code: 'Status Code',
  bytes_sent: 'Bytes Sent',
  bytes_recv: 'Bytes Received',
  request_id: 'Request ID',
  session_id: 'Session ID',
  trace_id: 'Trace ID',
  hash_algo: 'Hash Algo',
};

function compareAttributes(left: string, right: string): number {
  const leftIndex = PRIORITY_ATTRIBUTES.indexOf(left);
  const rightIndex = PRIORITY_ATTRIBUTES.indexOf(right);
  if (leftIndex >= 0 && rightIndex >= 0) return leftIndex - rightIndex;
  if (leftIndex >= 0) return -1;
  if (rightIndex >= 0) return 1;
  return left.localeCompare(right);
}

function hasDisplayValue(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
}

export function getDetectedLogAttributes(events: ParsedLog[]): string[] {
  const detected = new Set<string>();

  for (const event of events) {
    for (const [key, value] of Object.entries(event)) {
      if (INTERNAL_ATTRIBUTES.has(key) || !hasDisplayValue(value)) continue;
      detected.add(key);
    }
  }

  return [...detected].sort(compareAttributes);
}

export function getAttributeLabel(attribute: string): string {
  return ATTRIBUTE_LABELS[attribute] ?? attribute.replace(/_/g, ' ');
}

export function getAttributePickerOptions(events: ParsedLog[]): string[] {
  return getDetectedLogAttributes(events).filter((attribute) => !EXCLUDED_FROM_PICKER.has(attribute));
}

export function getVisibleLogAttributes(
  events: ParsedLog[],
  hiddenLogAttributes: Settings['hiddenLogAttributes']
): string[] {
  const hidden = new Set(hiddenLogAttributes);
  const detected = getDetectedLogAttributes(events);
  const optional = detected.filter(
    (attribute) => !REQUIRED_LOG_ATTRIBUTES.includes(attribute as (typeof REQUIRED_LOG_ATTRIBUTES)[number])
      && !hidden.has(attribute)
      && !EXCLUDED_FROM_PICKER.has(attribute)
  );

  return [...REQUIRED_LOG_ATTRIBUTES, ...optional];
}

export function getVisibleDashboardAttributes(
  events: ParsedLog[],
  hiddenLogAttributes: Settings['hiddenLogAttributes']
): string[] {
  return getVisibleLogAttributes(events, hiddenLogAttributes).filter(
    (attribute) => !REQUIRED_LOG_ATTRIBUTES.includes(attribute as (typeof REQUIRED_LOG_ATTRIBUTES)[number])
  );
}

function formatRelativeTime(date: Date): string {
  const diffMs = date.getTime() - Date.now();
  const diffAbsSeconds = Math.round(Math.abs(diffMs) / 1000);

  if (diffAbsSeconds < 5) return 'just now';
  if (diffAbsSeconds < 60) return `${diffAbsSeconds}s ${diffMs < 0 ? 'ago' : 'from now'}`;

  const diffAbsMinutes = Math.round(diffAbsSeconds / 60);
  if (diffAbsMinutes < 60) return `${diffAbsMinutes}m ${diffMs < 0 ? 'ago' : 'from now'}`;

  const diffAbsHours = Math.round(diffAbsMinutes / 60);
  if (diffAbsHours < 24) return `${diffAbsHours}h ${diffMs < 0 ? 'ago' : 'from now'}`;

  const diffAbsDays = Math.round(diffAbsHours / 24);
  return `${diffAbsDays}d ${diffMs < 0 ? 'ago' : 'from now'}`;
}

export function formatTimestamp(value: unknown, timestampFormat: Settings['timestampFormat']): string {
  if (!hasDisplayValue(value)) return '-';
  const raw = String(value);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;

  if (timestampFormat === 'local') {
    return date.toLocaleString();
  }

  if (timestampFormat === 'relative') {
    return formatRelativeTime(date);
  }

  return date.toISOString().replace('T', ' ').replace('.000Z', 'Z');
}

export function formatLogValue(
  attribute: string,
  value: unknown,
  timestampFormat: Settings['timestampFormat']
): string {
  if (attribute === 'timestamp') {
    return formatTimestamp(value, timestampFormat);
  }

  if (!hasDisplayValue(value)) return '-';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}