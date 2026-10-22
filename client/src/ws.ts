import { useEffect, useRef, useState } from 'react';
import type { WsMessage } from './types';

/** Until the server says how often it beats; a page on an older server just redials a quiet link now and then. */
const DEFAULT_BEAT_MS = 30_000;

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
    let heard = 0;
    let beatMs = DEFAULT_BEAT_MS;

    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const sock = new WebSocket(`${proto}://${location.host}/ws?role=${role}`);
      ws = sock;
      sock.onopen = () => {
        delay = 1000;
        heard = Date.now();
        setConnected(true);
      };
      sock.onmessage = (ev) => {
        heard = Date.now();
        try {
          const m = JSON.parse(String(ev.data)) as WsMessage | { type: 'heartbeat'; everyMs?: unknown };
          if (m.type === 'heartbeat') {
            if (typeof m.everyMs === 'number' && m.everyMs > 0) beatMs = m.everyMs;
            return;
          }
          handler.current(m);
        } catch (err) {
          console.error('bad ws message', err);
        }
      };
      sock.onclose = () => {
        if (ws !== sock) return;
        ws = null;
        setConnected(false);
        if (closed) return;
        timer = window.setTimeout(connect, delay);
        delay = Math.min(delay * 2, 10_000);
      };
      sock.onerror = () => sock.close();
    };

    // A link can stay open and go silent: a phone that slept, a network that changed under it. It never
    // closes on its own, so nothing would arrive and nothing would poll. Past two and a half heartbeats
    // of silence, let it go and dial again; the fresh link brings the state with it.
    const watchdog = window.setInterval(() => {
      const sock = ws;
      if (closed || !sock || sock.readyState !== WebSocket.OPEN || Date.now() - heard < beatMs * 2.5) return;
      ws = null;
      sock.onopen = sock.onmessage = sock.onclose = sock.onerror = null;
      try {
        sock.close();
      } catch {
        /* already gone */
      }
      setConnected(false);
      connect();
    }, 1000);

    connect();
    return () => {
      closed = true;
      window.clearInterval(watchdog);
      if (timer) window.clearTimeout(timer);
      ws?.close();
    };
  }, [role, enabled]);

  return connected;
}
