import http from 'node:http';
import { Db } from './db.js';
import { CREDENTIAL_LABEL, detectCredential, env, ensureDirs } from './env.js';
import { createApp } from './http/app.js';
import { Hub } from './http/ws.js';
import { GameService } from './service.js';
import { aiLive, findClaudeBinary, probeAuth } from './ai/agent.js';

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
  const credential = detectCredential();
  if (aiLive()) {
    console.log(`[section30] AI live: ${env.claudeModel} via ${CREDENTIAL_LABEL[credential]}`);
    if (process.env.ANTHROPIC_API_KEY && process.env.CLAUDE_CODE_OAUTH_TOKEN) {
      console.log('[section30] both ANTHROPIC_API_KEY and CLAUDE_CODE_OAUTH_TOKEN are set; Claude Code uses the API key');
    }
    console.log(`[section30] Claude Code binary: ${findClaudeBinary() ?? 'not found in node_modules, the SDK will search'}`);
    void probeAuth().then((state) => console.log(`[section30] credential present: ${state} (local check, not validated against the API)`));
  } else {
    console.log(
      `[section30] AI MOCK${env.aiMode === 'mock' ? ' (AI_MODE=mock)' : ' (no credential: set CLAUDE_CODE_OAUTH_TOKEN, run `claude auth login` in the container, or set ANTHROPIC_API_KEY)'}`,
    );
  }
  console.log(`[section30] GM dashboard ${env.gmPassword ? 'enabled' : 'DISABLED (set GM_PASSWORD)'}`);
  console.log(`[section30] player key ${env.playerKey ? 'required (?k=...)' : 'not set, player link is open'}`);
});

function shutdown(signal: string): void {
  console.log(`[section30] ${signal}, shutting down`);
  service.close();
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
