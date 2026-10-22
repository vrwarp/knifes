import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { env, sessionSecret } from '../env.js';

const secret = sessionSecret().value;

export const GM_COOKIE = 's30gm';
export const PLAYER_COOKIE = 's30p';

export function sign(value: string): string {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) out[k] = safeDecode(v);
  }
  return out;
}

/** Another app on the same host may set a cookie such as `progress=100%`; that must not break this one. */
function safeDecode(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

export function cookieHeader(name: string, value: string, maxAgeSec: number): string {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${env.cookieSecure ? '; Secure' : ''}`;
}

export function checkGmPassword(given: string): boolean {
  if (!env.gmPassword) return false;
  return safeEqual(given, env.gmPassword);
}

export function makeGmToken(): string {
  const ts = Date.now().toString(36);
  return `${ts}.${sign(`gm:${ts}`)}`;
}

export function verifyGmToken(token: string | undefined): boolean {
  if (!token) return false;
  const i = token.lastIndexOf('.');
  if (i < 0) return false;
  return safeEqual(token.slice(i + 1), sign(`gm:${token.slice(0, i)}`));
}

export function playerToken(): string {
  return sign(`player:${env.playerKey}`);
}

export function verifyPlayerToken(token: string | undefined): boolean {
  if (!env.playerKey) return true;
  if (!token) return false;
  return safeEqual(token, playerToken());
}

/** A month, renewed while the console is in use: a laptop signed in during setup is still signed in on the night. */
export const GM_LOGIN_SECONDS = 60 * 60 * 24 * 30;
const RENEW_AFTER_MS = 24 * 60 * 60 * 1000;

/** When a GM token was issued, or 0 when it does not say. */
function gmTokenTime(token: string): number {
  const ts = parseInt(token.slice(0, token.lastIndexOf('.')), 36);
  return Number.isFinite(ts) ? ts : 0;
}

export function gmAuth(req: Request, res: Response, next: NextFunction): void {
  const token = parseCookies(req.headers.cookie)[GM_COOKIE];
  if (!verifyGmToken(token)) {
    res.status(401).json({ error: 'GM login required' });
    return;
  }
  // Once a day at most, by a read (the console reads on every load and reconnect), a fresh login for another month.
  // Not on every request: a reply still on its way after a Log out would sign the browser straight back in.
  if (req.method === 'GET' && Date.now() - gmTokenTime(token!) > RENEW_AFTER_MS) res.setHeader('Set-Cookie', cookieHeader(GM_COOKIE, makeGmToken(), GM_LOGIN_SECONDS));
  next();
}

/** Sets the player cookie when the QR link carries the right key. Safe to run on every request. */
export function playerKeyFromQuery(req: Request, res: Response, next: NextFunction): void {
  if (env.playerKey) {
    const k = req.query.k;
    if (typeof k === 'string' && safeEqual(k, env.playerKey)) {
      res.setHeader('Set-Cookie', cookieHeader(PLAYER_COOKIE, playerToken(), 60 * 60 * 24 * 14));
      req.headers.cookie = `${req.headers.cookie ? req.headers.cookie + '; ' : ''}${PLAYER_COOKIE}=${playerToken()}`;
    }
  }
  next();
}

export function playerAuth(req: Request, res: Response, next: NextFunction): void {
  if (!verifyPlayerToken(parseCookies(req.headers.cookie)[PLAYER_COOKIE])) {
    res.status(401).json({ error: 'This terminal requires the recovery link' });
    return;
  }
  next();
}
