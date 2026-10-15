import http from 'node:http';
import { Db } from './db.js';
import { env, ensureDirs } from './env.js';
import { createApp } from './http/app.js';
import { Hub } from './http/ws.js';
import { GameService } from './service.js';
import { aiLive } from './ai/agent.js';

ensureDirs();
const db = new Db(env.dbPath);
const service = new GameService(db);
const app = createApp(service);
const server = http.createServer(app);
const hub = new Hub(service);
hub.attach(server);

server.listen(env.port, () => {
  console.log(`[section30] listening on :${env.port}`);
  console.log(`[section30] data dir ${env.dataDir}`);
  console.log(`[section30] AI ${aiLive() ? `live (${env.claudeModel})` : 'MOCK (set ANTHROPIC_API_KEY to go live)'}`);
  console.log(`[section30] GM dashboard ${env.gmPassword ? 'enabled' : 'DISABLED (set GM_PASSWORD)'}`);
  console.log(`[section30] player key ${env.playerKey ? 'required (?k=...)' : 'not set, player link is open'}`);
});

function shutdown(signal: string): void {
  console.log(`[section30] ${signal}, shutting down`);
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
