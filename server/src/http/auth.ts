import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../env.js';

const secret = env.sessionSecret || crypto.randomBytes(32).toString('hex');

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
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
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

export function gmAuth(req: Request, res: Response, next: NextFunction): void {
  if (!verifyGmToken(parseCookies(req.headers.cookie)[GM_COOKIE])) {
    res.status(401).json({ error: 'GM login required' });
    return;
  }
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
