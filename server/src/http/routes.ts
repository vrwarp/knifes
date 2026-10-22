import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response, Router } from 'express';
import multer from 'multer';
import { AgentError, aiLive, probeAuth, runAgent } from '../ai/agent.js';
import { ClaudeLogin, LoginError, envCredentialShadowsLogin, readAccount } from '../ai/login.js';
import { CREDENTIAL_LABEL, detectCredential, env } from '../env.js';
import { HttpError, type GameService } from '../service.js';
import { STAGE_ORDER, type StageId } from '../types.js';
import { GM_COOKIE, GM_LOGIN_SECONDS, checkGmPassword, cookieHeader, gmAuth, makeGmToken, playerAuth } from './auth.js';

const IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 40 * 1024 * 1024 } });

function str(v: unknown, max = 500): string {
  return typeof v === 'string' ? v.slice(0, max) : '';
}

function num(v: unknown): number {
  // Number(null), Number('') and Number([]) are all 0: only a real number or a numeric string counts.
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  if (!Number.isFinite(n)) throw new HttpError(400, 'Expected a number');
  return n;
}

export function playerRouter(service: GameService): Router {
  const r = Router();
  r.use(playerAuth);

  r.get('/state', (_req, res) => res.json(service.view()));
  r.post('/start', (_req, res) => {
    service.start();
    res.json(service.view());
  });
  r.post('/geo/guess', (req, res) => res.json(service.geoGuess(num(req.body?.lat), num(req.body?.lng))));
  r.post('/geo/proceed', (_req, res) => {
    service.geoProceed();
    res.json(service.view());
  });
  r.post('/gate', (req, res) => res.json({ ok: service.gateAttempt(str(req.body?.code, 80)) }));
  r.post('/hack/guess', (req, res) => res.json(service.hackGuess(str(req.body?.word, 20))));
  r.post('/hack/retry', (_req, res) => {
    service.hackRetry();
    res.json(service.view());
  });
  r.post('/reveal/continue', (_req, res) => {
    service.revealContinue();
    res.json(service.view());
  });
  r.get('/ledger', (_req, res) => res.json(service.ledgerFiles()));
  r.get('/archive', (_req, res) => res.json({ messages: service.archiveTranscript() }));
  r.post('/archive', async (req, res) => {
    const { question, reply } = await service.archiveSend(str(req.body?.text, 4000));
    // The question too, so the transcript shows it even when the live link is down.
    res.json({ message: reply, question });
  });
  return r;
}

export function gmRouter(service: GameService): Router {
  const r = Router();

  r.post('/login', (req, res) => {
    if (!env.gmPassword) throw new HttpError(503, 'GM_PASSWORD is not set on the server');
    if (!checkGmPassword(str(req.body?.password, 200))) throw new HttpError(401, 'Wrong password');
    res.setHeader('Set-Cookie', cookieHeader(GM_COOKIE, makeGmToken(), GM_LOGIN_SECONDS));
    res.json({ ok: true });
  });
  r.post('/logout', (_req, res) => {
    res.setHeader('Set-Cookie', cookieHeader(GM_COOKIE, '', 0));
    res.json({ ok: true });
  });

  r.use(gmAuth);
  r.get('/me', (_req, res) => res.json({ ok: true }));
  r.get('/overview', async (_req, res) => res.json(await service.overview()));
  r.put('/config', (req, res) => res.json({ config: service.updateConfig(req.body) }));
  r.get('/config/history', (req, res) => {
    const before = Number(req.query.before);
    res.json(service.configHistory(Number.isFinite(before) && before > 0 ? before : undefined));
  });
  r.get('/config/history/:version', (req, res) => res.json(service.configVersion(num(req.params.version))));
  r.post('/config/restore', (req, res) => res.json({ config: service.restoreConfig(num(req.body?.version)) }));

  r.get('/assistant', (_req, res) => res.json(service.assistantView()));
  r.post('/assistant', async (req, res) => res.json({ message: await service.assistantSend(str(req.body?.text, 4000)) }));
  r.post('/assistant/reset', (_req, res) => {
    service.assistantReset();
    res.json({ ok: true });
  });
  r.post('/assistant/proposals/:id/apply', (req, res) => res.json({ config: service.applyProposal(num(req.params.id)) }));
  r.post('/assistant/proposals/:id/dismiss', (req, res) => {
    service.dismissProposal(num(req.params.id));
    res.json({ ok: true });
  });
  r.post('/stage', (req, res) => {
    const stage = str(req.body?.stage, 30) as StageId;
    if (!STAGE_ORDER.includes(stage)) throw new HttpError(400, 'Unknown stage');
    service.setStage(stage);
    res.json({ ok: true });
  });
  r.post('/hack/scripts', (_req, res) => {
    service.regenerateScripts();
    res.json({ ok: true });
  });
  r.post('/reset', (req, res) => {
    const scope = str(req.body?.scope, 30);
    if (scope !== 'game' && !STAGE_ORDER.includes(scope as StageId)) throw new HttpError(400, 'Unknown scope');
    service.reset(scope as 'game' | StageId);
    res.json({ ok: true });
  });
  r.post('/hint', (req, res) => res.json({ hint: service.pushHint(str(req.body?.text, 1000)) }));
  r.post('/hint/draft', async (req, res) => {
    const strength = str(req.body?.strength, 10);
    const s = strength === 'clear' || strength === 'strong' ? strength : 'nudge';
    res.json(await service.draftHint(s));
  });
  r.post('/archive/lock', (req, res) => {
    service.setArchiveLocked(Boolean(req.body?.locked));
    res.json({ ok: true });
  });
  r.post('/ledger/release', (req, res) => {
    service.releaseLayer2(req.body?.released === undefined ? true : Boolean(req.body?.released));
    res.json({ ok: true });
  });
  r.post('/archive/reset', (_req, res) => {
    service.archiveNewSession();
    res.json({ ok: true });
  });
  r.post('/report/generate', async (_req, res) => res.json(await service.generateReport()));

  // ---- Claude link: sign the container in from the console --------------------------------
  const login = new ClaudeLogin();
  const loginGuard = async (res: Response, fn: () => Promise<unknown>) => {
    try {
      res.json(await fn());
    } catch (e) {
      if (e instanceof LoginError) throw new HttpError(e.status, e.message);
      throw e;
    }
  };
  r.get('/claude', async (req, res) => {
    const credential = detectCredential();
    res.json({
      mode: aiLive() ? 'live' : 'mock',
      forcedMock: env.aiMode === 'mock',
      credential,
      credentialLabel: CREDENTIAL_LABEL[credential],
      shadowedByEnv: envCredentialShadowsLogin(),
      hasLoginFile: fs.existsSync(path.join(env.claudeConfigDir, '.credentials.json')),
      auth: credential === 'none' ? 'needs_login' : await probeAuth(),
      inProgress: login.inProgress,
      model: env.claudeModel,
      account: req.query.account === '1' && credential !== 'none' ? await readAccount() : undefined,
    });
  });
  r.post('/claude/login/start', (_req, res) => loginGuard(res, () => login.start()));
  r.post('/claude/login/code', (req, res) => loginGuard(res, () => login.submit(str(req.body?.id, 100), str(req.body?.code, 2000))));
  r.post('/claude/login/cancel', (_req, res) => {
    login.cancel();
    res.json({ ok: true });
  });
  r.post('/claude/logout', (_req, res) => loginGuard(res, async () => (await login.signOut(), { ok: true })));
  // One tiny real request, so "linked" means "answers", not just "a credential file exists".
  r.post('/claude/test', async (_req, res) => {
    if (!aiLive()) return res.json({ ok: false, error: env.aiMode === 'mock' ? 'AI_MODE is set to mock.' : 'No Claude credential yet. Sign in first.' });
    const started = Date.now();
    try {
      const out = await runAgent({
        prompt: 'Reply with exactly: LINK OK',
        systemPrompt: 'You are a connectivity check. Reply with exactly the requested words.',
        maxTurns: 1,
        effort: 'low',
        timeoutMs: 90_000,
      });
      res.json({ ok: true, reply: out.text.trim().slice(0, 200), ms: Date.now() - started, model: env.claudeModel });
    } catch (e) {
      const msg = e instanceof AgentError ? e.message : e instanceof Error ? e.message : String(e);
      res.json({ ok: false, error: msg.slice(0, 500), ms: Date.now() - started });
    }
  });

  r.post('/upload', upload.single('file'), (req, res) => {
    if (req.query.kind !== 'photo') throw new HttpError(400, 'kind must be photo');
    const file = req.file;
    if (!file) throw new HttpError(400, 'No file');
    const ext = IMAGE_TYPES[file.mimetype];
    if (!ext) throw new HttpError(415, `Unsupported photo type ${file.mimetype}`);
    const id = `photo-${crypto.randomBytes(6).toString('hex')}.${ext}`;
    fs.writeFileSync(path.join(env.uploadsDir, id), file.buffer);
    service.attachUpload('photo', id);
    // The version this upload became, so an editor with unsaved changes knows it was not another GM's save.
    res.json({ id, url: `/uploads/${id}`, version: service.config.version });
  });
  r.delete('/upload/:id', (req, res) => {
    const id = path.basename(String(req.params.id));
    // The file stays on disk: older configuration versions may still use it.
    service.detachUpload(id);
    res.json({ ok: true, version: service.config.version });
  });

  return r;
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err instanceof multer.MulterError) {
    res.status(400).json({ error: err.message });
    return;
  }
  const e = err as { status?: number; type?: string; message?: string };
  // The body parser's own refusals (malformed JSON, too large, wrong charset) are the client's to fix, not a server fault.
  if (e?.type === 'entity.parse.failed' || (typeof e?.status === 'number' && e.status >= 400 && e.status < 500)) {
    res.status(e.status && e.status !== 400 ? e.status : 400).json({ error: e.status === 413 ? 'Request too large' : 'Bad request' });
    return;
  }
  console.error('unhandled error', err);
  res.status(500).json({ error: 'Internal error' });
}

export function photosRouter(): Router {
  const r = Router();
  r.get('/:id', (req, res) => {
    const id = path.basename(String(req.params.id));
    if (!id.startsWith('photo-')) throw new HttpError(404, 'Not found');
    res.sendFile(path.join(env.uploadsDir, id), (err) => {
      if (err) res.status(404).end();
    });
  });
  return r;
}

export const json = express.json;
