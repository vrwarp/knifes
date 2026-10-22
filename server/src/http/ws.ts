import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import type { GameService, ServerMessage } from '../service.js';
import { GM_COOKIE, PLAYER_COOKIE, parseCookies, verifyGmToken, verifyPlayerToken } from './auth.js';

type Role = 'player' | 'gm';

export class Hub {
  private readonly wss = new WebSocketServer({ noServer: true });
  private readonly sockets = new Map<WebSocket, Role>();
  /** Whether each socket answered the last ping; one that did not is gone (a phone that slept without closing). */
  private readonly alive = new WeakMap<WebSocket, boolean>();

  /** Sent on connect and with every ping. Browsers never see a ping, so this is how a page learns its link is still there. */
  private readonly beat: string;

  constructor(
    private readonly service: GameService,
    heartbeatMs = 30_000,
  ) {
    this.beat = JSON.stringify({ type: 'heartbeat', everyMs: heartbeatMs });
    service.subscribe((m) => this.route(m));
    const timer = setInterval(() => {
      for (const ws of this.sockets.keys()) {
        try {
          if (ws.readyState !== WebSocket.OPEN) continue;
          if (this.alive.get(ws) === false) {
            // No pong since the last ping: drop it, so the console stops counting a phone that is not there.
            ws.terminate();
            continue;
          }
          this.alive.set(ws, false);
          ws.ping();
          ws.send(this.beat);
        } catch (err) {
          console.error('[section30] websocket heartbeat failed', err);
        }
      }
    }, heartbeatMs);
    timer.unref();
  }

  attach(server: Server): void {
    server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      // Anything thrown here would be an uncaught exception, and one odd request must never take the game down.
      try {
        this.upgrade(req, socket, head);
      } catch (err) {
        console.error('[section30] websocket upgrade failed', err);
        socket.destroy();
      }
    });
  }

  private upgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    if (!req.url || !req.url.startsWith('/ws')) {
      socket.destroy();
      return;
    }
    const url = new URL(req.url, 'http://localhost');
    const role: Role = url.searchParams.get('role') === 'gm' ? 'gm' : 'player';
    const cookies = parseCookies(req.headers.cookie);
    const ok = role === 'gm' ? verifyGmToken(cookies[GM_COOKIE]) : verifyPlayerToken(cookies[PLAYER_COOKIE]);
    if (!ok) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    this.wss.handleUpgrade(req, socket, head, (ws) => {
      this.sockets.set(ws, role);
      this.alive.set(ws, true);
      ws.on('pong', () => this.alive.set(ws, true));
      const gone = () => {
        if (this.sockets.delete(ws) && role === 'player') this.route(this.service.snapshotMessage());
      };
      ws.on('close', gone);
      ws.on('error', gone);
      ws.send(this.beat);
      this.send(ws, role, this.service.snapshotMessage());
      if (role === 'player') this.route(this.service.snapshotMessage());
    });
  }

  counts(): { players: number; gms: number } {
    let players = 0;
    let gms = 0;
    for (const role of this.sockets.values()) {
      if (role === 'gm') gms++;
      else players++;
    }
    return { players, gms };
  }

  private route(m: ServerMessage): void {
    for (const [ws, role] of this.sockets) {
      // One socket failing must not keep the message from the others.
      try {
        this.send(ws, role, m);
      } catch (err) {
        console.error('[section30] websocket send failed', err);
      }
    }
  }

  private send(ws: WebSocket, role: Role, m: ServerMessage): void {
    if (ws.readyState !== WebSocket.OPEN) return;
    let payload: unknown;
    switch (m.type) {
      case 'state':
        payload = role === 'gm' ? { type: 'gm', state: m.state, config: m.config, players: this.counts().players } : { type: 'state', player: m.player };
        break;
      case 'event':
      case 'assistant':
      case 'assistant_status':
      case 'assistant_proposal':
        // GM-only: the setup assistant talks about the solution.
        if (role !== 'gm') return;
        payload = m;
        break;
      default:
        payload = m;
    }
    ws.send(JSON.stringify(payload));
  }
}
