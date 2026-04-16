import type { ParsedLog } from '../../types/logs';

function eventKey(event: ParsedLog): string {
  const id = event.id;
  if (typeof id === 'number' || typeof id === 'string') {
    return `id:${id}`;
  }

  return [
    event.timestamp,
    event.severity,
    event.host,
    event.proc,
    event.src_ip,
    event.dst_ip,
    event.login,
    event.login_status,
    event.command,
    event.uri,
    event.status_code,
    event.bytes_sent,
    event.request_id,
    event.session_id,
    event.raw,
  ].map((value) => String(value ?? '')).join('|');
}

export function mergeUniqueEvents(
  existing: ParsedLog[],
  incoming: ParsedLog[],
  limit?: number,
): { events: ParsedLog[]; addedCount: number } {
  const seen = new Set(existing.map(eventKey));
  const uniqueIncoming: ParsedLog[] = [];

  for (const event of incoming) {
    const key = eventKey(event);
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueIncoming.push(event);
  }

  const merged = [...uniqueIncoming, ...existing];
  return {
    events: typeof limit === 'number' ? merged.slice(0, limit) : merged,
    addedCount: uniqueIncoming.length,
  };
}