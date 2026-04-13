'use client';

import { useEffect, useRef } from 'react';
import type { ParsedLog } from '../../types/logs';

export type StreamStatus = 'connecting' | 'connected' | 'disconnected';

export function useCollectorStream(
  onEvents: (events: ParsedLog[]) => void,
  onStatusChange: (status: StreamStatus) => void,
) {
  const onEventsRef = useRef(onEvents);
  const onStatusRef = useRef(onStatusChange);

  useEffect(() => { onEventsRef.current = onEvents; });
  useEffect(() => { onStatusRef.current = onStatusChange; });

  useEffect(() => {
    let destroyed = false;
    let retryTimeout: ReturnType<typeof setTimeout>;

    function connect() {
      if (destroyed) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${proto}//${window.location.host}/ws/collector`;
      onStatusRef.current('connecting');

      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        if (!destroyed) onStatusRef.current('connected');
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'collector_events' && Array.isArray(msg.events)) {
            onEventsRef.current(msg.events as ParsedLog[]);
          }
        } catch {
          // ignore malformed frames
        }
      };

      ws.onclose = () => {
        if (!destroyed) {
          onStatusRef.current('disconnected');
          retryTimeout = setTimeout(connect, 3000);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
      destroyed = true;
      clearTimeout(retryTimeout);
    };
  }, []);
}
