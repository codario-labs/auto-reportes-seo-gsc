import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { parseEnv } from '../../config/env';
import { AccessService } from '../../modules/access/access.service';
import { createPkcePair, TokenCipher } from '../crypto';
import { StorageService, safeFileName } from '../storage';
import { assertSafeSvg, detectImage, validateLogoUpload } from '../uploads';

const key = randomBytes(32).toString('base64');

describe('TokenCipher', () => {
  it('encrypts and decrypts with AES-256-GCM', () => {
    const cipher = new TokenCipher(key);
    const encrypted = cipher.encrypt('ya29.secret-token');
    expect(encrypted).not.toContain('secret');
    expect(encrypted.startsWith('v1:')).toBe(true);
    expect(cipher.decrypt(encrypted)).toBe('ya29.secret-token');
  });

  it('uses a random IV per encryption', () => {
    const cipher = new TokenCipher(key);
    expect(cipher.encrypt('same')).not.toBe(cipher.encrypt('same'));
  });

  it('detects tampering', () => {
    const cipher = new TokenCipher(key);
    const parts = cipher.encrypt('value').split(':');
    parts[3] = Buffer.from('tampered').toString('base64url');
    expect(() => cipher.decrypt(parts.join(':'))).toThrow();
  });

  it('rejects keys of the wrong length', () => {
    expect(() => new TokenCipher(randomBytes(16).toString('base64'))).toThrow();
  });

  it('creates valid PKCE pairs', () => {
    const { verifier, challenge } = createPkcePair();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});

describe('AccessService', () => {
  const access = new AccessService({ accessKey: 'correct-horse-battery', sessionSecret: 'x'.repeat(40), ttlHours: 1, secureCookies: false });

  it('verifies the access key in constant time', () => {
    expect(access.verifyAccessKey('correct-horse-battery')).toBe(true);
    expect(access.verifyAccessKey('wrong')).toBe(false);
  });

  it('issues and verifies signed sessions', () => {
    const { token, session } = access.createSession();
    expect(access.verifySession(token)?.sessionId).toBe(session.sessionId);
  });

  it('rejects tampered and expired sessions', () => {
    const { token } = access.createSession();
    const [sid, exp, sig] = token.split('.');
    expect(access.verifySession(`${sid}.${Number(exp) + 999999}.${sig}`)).toBeNull();
    expect(access.verifySession(token, new Date(Date.now() + 2 * 3_600_000))).toBeNull();
    expect(access.verifySession(undefined)).toBeNull();
    expect(access.verifySession('garbage')).toBeNull();
  });

  it('produces HttpOnly SameSite cookies', () => {
    expect(access.cookieOptions()).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' });
  });
});

describe('uploads', () => {
  const png = Buffer.from('89504E470D0A1A0A0000000D49484452', 'hex');
  const svg = Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>');

  it('detects images by content', () => {
    expect(detectImage(png)?.ext).toBe('png');
    expect(detectImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))?.ext).toBe('jpg');
    expect(detectImage(Buffer.from('RIFF0000WEBPVP8 '))?.ext).toBe('webp');
    expect(detectImage(svg)?.ext).toBe('svg');
    expect(detectImage(Buffer.from('hello'))).toBeNull();
  });

  it('rejects unsafe SVG content', () => {
    expect(() => assertSafeSvg(Buffer.from('<svg><script>alert(1)</script></svg>'))).toThrow(/scripts/);
    expect(() => assertSafeSvg(Buffer.from('<svg onload="x()"></svg>'))).toThrow(/event handlers/);
    expect(() => assertSafeSvg(Buffer.from('<svg><image href="https://evil.com/a.png"/></svg>'))).toThrow(/external/);
    expect(() => assertSafeSvg(Buffer.from('<!DOCTYPE svg [<!ENTITY x "y">]><svg/>'))).toThrow(/DTD/);
    expect(() => assertSafeSvg(svg)).not.toThrow();
  });

  it('validates MIME, content and size', () => {
    expect(validateLogoUpload({ buffer: png, mimetype: 'image/png', size: png.length }).ext).toBe('png');
    expect(() => validateLogoUpload({ buffer: png, mimetype: 'image/jpeg', size: png.length })).toThrow(/does not match/);
    expect(() => validateLogoUpload({ buffer: Buffer.from('text'), mimetype: 'image/png', size: 4 })).toThrow(/not a valid/);
    expect(() => validateLogoUpload({ buffer: png, mimetype: 'application/pdf', size: png.length })).toThrow(/Only PNG/);
    expect(() => validateLogoUpload({ buffer: png, mimetype: 'image/png', size: 3 * 1024 * 1024 })).toThrow(/exceeds/);
    expect(() => validateLogoUpload(undefined)).toThrow(/No file/);
  });
});

describe('StorageService', () => {
  it('prevents path traversal', () => {
    const storage = new StorageService('./storage-test');
    expect(() => storage.resolve('../etc/passwd')).toThrow();
    expect(() => storage.resolve('/etc/passwd')).toThrow();
    expect(storage.resolve('reports/a.pdf')).toContain('reports');
  });

  it('builds safe file names', () => {
    expect(safeFileName('Reporte SEO — Tienda ñandú/../x.pdf')).toBe('Reporte-SEO-Tienda-nandu-..-x.pdf');
    expect(safeFileName('')).toBe('file');
  });
});

describe('parseEnv', () => {
  const valid = {
    APP_ACCESS_KEY: 'a-long-access-key',
    SESSION_SECRET: 's'.repeat(40),
    DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
    TOKEN_ENCRYPTION_KEY: key,
  };

  it('applies defaults', () => {
    const env = parseEnv(valid);
    expect(env.ANTHROPIC_MODEL).toBe('claude-opus-5-5');
    expect(env.ANTHROPIC_ENABLE_FALLBACK).toBe(true);
    expect(env.CORS_ORIGINS).toContain('http://localhost:8080');
    expect(env.GOOGLE_OAUTH_CLIENT_ID).toBeUndefined();
  });

  it('reports invalid configuration clearly', () => {
    expect(() => parseEnv({ ...valid, TOKEN_ENCRYPTION_KEY: 'short' })).toThrow(/TOKEN_ENCRYPTION_KEY/);
    expect(() => parseEnv({ ...valid, APP_ACCESS_KEY: 'short' })).toThrow(/APP_ACCESS_KEY/);
    expect(() => parseEnv({ ...valid, APP_TIMEZONE: 'Mars/Olympus' })).toThrow(/APP_TIMEZONE/);
  });
});
