import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import type { GameService, ServerMessage } from '../service.js';
import { GM_COOKIE, PLAYER_COOKIE, parseCookies, verifyGmToken, verifyPlayerToken } from './auth.js';

type Role = 'player' | 'gm';

export class Hub {
  private readonly wss = new WebSocketServer({ noServer: true });
  private readonly sockets = new Map<WebSocket, Role>();

  constructor(private readonly service: GameService) {
    service.subscribe((m) => this.route(m));
    const timer = setInterval(() => {
      for (const ws of this.sockets.keys()) {
        if (ws.readyState === WebSocket.OPEN) ws.ping();
      }
    }, 30_000);
    timer.unref();
  }

  attach(server: Server): void {
    server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
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
        ws.on('close', () => this.sockets.delete(ws));
        ws.on('error', () => this.sockets.delete(ws));
        this.send(ws, role, this.service.snapshotMessage());
      });
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
    for (const [ws, role] of this.sockets) this.send(ws, role, m);
  }

  private send(ws: WebSocket, role: Role, m: ServerMessage): void {
    if (ws.readyState !== WebSocket.OPEN) return;
    let payload: unknown;
    switch (m.type) {
      case 'state':
        payload = role === 'gm' ? { type: 'gm', state: m.state, config: m.config } : { type: 'state', player: m.player };
        break;
      case 'event':
        if (role !== 'gm') return;
        payload = m;
        break;
      default:
        payload = m;
    }
    ws.send(JSON.stringify(payload));
  }
}
