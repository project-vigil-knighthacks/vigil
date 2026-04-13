// Types for Vigil SIEM log parsing (grokmoment output)

export interface ParsedLog {
  [key: string]: unknown;

  id?: number | string;

  // Core fields from grokmoment
  timestamp?: string;
  host?: string;
  proc?: string;
  pid?: string;
  severity?: 'info' | 'warning' | 'critical' | 'unknown';

  // Authentication fields
  login?: string;
  target_user?: string;
  auth_method?: string;
  login_status?: string;

  // Network fields
  src_ip?: string;
  dst_ip?: string;
  src_port?: string;
  dst_port?: string;

  // Command fields
  command?: string;
  args?: string;
  tty?: string;
  pwd?: string;

  // HTTP fields
  uri?: string;
  url?: string;
  status_code?: string;
  bytes_sent?: string;
  bytes_recv?: string;

  // Session fields
  session_id?: string;
  request_id?: string;

  // Unmatched indicator
  raw?: string;
  unmatched?: boolean;
}

export interface LogParseResult {
  format: 'syslog';
  count: number;
  logs: ParsedLog[];
  parsed_at: string;
  filename?: string;
  
  // API key status
  api_key_available?: boolean;
  api_key_required?: boolean;
  api_key_message?: string;
  unmatched_count?: number;
  learning_in_progress?: boolean; // indicates background pattern learning is still running
}

// Response shape from GET /api/events (SQLite-backed)
export interface EventsResponse {
  events: ParsedLog[];
  total: number;
  limit: number;
  offset: number;
}
