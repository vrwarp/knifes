import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { env } from '../env.js';
import type { GameService } from '../service.js';
import { playerKeyFromQuery } from './auth.js';
import { errorHandler, gmRouter, photosRouter, playerRouter } from './routes.js';

export function createApp(service: GameService): express.Express {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));
  app.use(playerKeyFromQuery);

  app.get('/healthz', (_req, res) => res.json({ ok: true, stage: service.state.stage }));
  app.use('/api/player', playerRouter(service));
  app.use('/api/gm', gmRouter(service));
  app.use('/uploads', photosRouter());

  const index = path.join(env.clientDist, 'index.html');
  if (fs.existsSync(index)) {
    app.use(express.static(env.clientDist, { index: false, maxAge: '1h' }));
    app.get(/^\/(?!api\/|uploads\/|ws).*/, (_req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      res.sendFile(index);
    });
  } else {
    app.get('/', (_req, res) => res.type('text').send('Section 30 server is running, but the client build is missing.'));
  }

  app.use(errorHandler);
  return app;
}
