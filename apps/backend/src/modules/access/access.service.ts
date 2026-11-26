import type { CookieOptions } from 'express';
import { hmacSha256, randomToken, safeEqual } from '../../lib/crypto';

export const ACCESS_COOKIE = 'cl_session';

export interface AccessSession {
  sessionId: string;
  expiresAt: Date;
}

/**
 * Protección de acceso para una app privada single-user (sin usuarios, sin registro).
 * El panel se desbloquea con APP_ACCESS_KEY y se emite una cookie de sesión firmada (HMAC-SHA256).
 */
export class AccessService {
  constructor(
    private readonly config: { accessKey: string; sessionSecret: string; ttlHours: number; secureCookies: boolean },
  ) {}

  verifyAccessKey(candidate: string): boolean {
    return safeEqual(candidate, this.config.accessKey);
  }

  createSession(now: Date = new Date()): { token: string; session: AccessSession } {
    const sessionId = randomToken(18);
    const expiresAt = new Date(now.getTime() + this.config.ttlHours * 3_600_000);
    const payload = `${sessionId}.${expiresAt.getTime()}`;
    return { token: `${payload}.${hmacSha256(this.config.sessionSecret, payload)}`, session: { sessionId, expiresAt } };
  }

  verifySession(token: string | undefined, now: Date = new Date()): AccessSession | null {
    if (!token || token.length > 256) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [sessionId, expires, signature] = parts as [string, string, string];
    const expected = hmacSha256(this.config.sessionSecret, `${sessionId}.${expires}`);
    if (!safeEqual(signature, expected)) return null;
    const expiresAt = Number(expires);
    if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) return null;
    return { sessionId, expiresAt: new Date(expiresAt) };
  }

  cookieOptions(expiresAt?: Date): CookieOptions {
    return {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.secureCookies,
      path: '/',
      ...(expiresAt ? { expires: expiresAt } : {}),
    };
  }
}
