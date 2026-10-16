import { useEffect, useRef, useState } from 'react';
import type { WsMessage } from './types';

export function useSocket(role: 'player' | 'gm', onMessage: (m: WsMessage) => void, enabled = true): boolean {
  const [connected, setConnected] = useState(false);
  const handler = useRef(onMessage);
  handler.current = onMessage;

  useEffect(() => {
    if (!enabled) return;
    let ws: WebSocket | null = null;
    let closed = false;
    let delay = 1000;
    let timer: number | undefined;

    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${proto}://${location.host}/ws?role=${role}`);
      ws.onopen = () => {
        delay = 1000;
        setConnected(true);
      };
      ws.onmessage = (ev) => {
        try {
          handler.current(JSON.parse(String(ev.data)) as WsMessage);
        } catch (err) {
          console.error('bad ws message', err);
        }
      };
      ws.onclose = () => {
        setConnected(false);
        if (closed) return;
        timer = window.setTimeout(connect, delay);
        delay = Math.min(delay * 2, 10_000);
      };
      ws.onerror = () => ws?.close();
    };
    connect();
    return () => {
      closed = true;
      if (timer) window.clearTimeout(timer);
      ws?.close();
    };
  }, [role, enabled]);

  return connected;
}
