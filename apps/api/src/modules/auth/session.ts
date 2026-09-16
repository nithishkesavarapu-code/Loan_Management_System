import { jwtVerify, SignJWT } from 'jose';
import type { CookieOptions, Response } from 'express';
import { SESSION_COOKIE } from '@lms/shared';
import type { Environment } from '../../config/env.js';
import { HttpError } from '../../middleware/errors.js';

export function cookieOptions(env: Environment): CookieOptions {
  return { httpOnly: true, secure: env.COOKIE_SECURE, sameSite: 'lax', path: '/' };
}
export async function createSession(userId: string, env: Environment): Promise<string> {
  return new SignJWT({}).setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(userId).setIssuer('lms-api').setAudience('lms-web').setIssuedAt()
    .setExpirationTime(`${env.JWT_TTL_SECONDS}s`).sign(new TextEncoder().encode(env.JWT_SECRET));
}
export async function verifySession(token: unknown, env: Environment): Promise<string> {
  try {
    if (typeof token !== 'string') throw new Error('Missing session');
    const { payload } = await jwtVerify(token, new TextEncoder().encode(env.JWT_SECRET), {
      algorithms: ['HS256'], issuer: 'lms-api', audience: 'lms-web', typ: 'JWT',
      requiredClaims: ['sub', 'iat', 'exp'], maxTokenAge: env.JWT_TTL_SECONDS,
    });
    if (!payload.sub || !/^[a-f\d]{24}$/i.test(payload.sub)
      || !Number.isSafeInteger(payload.iat) || !Number.isSafeInteger(payload.exp)
      || payload.exp! <= payload.iat! || payload.exp! - payload.iat! > env.JWT_TTL_SECONDS) {
      throw new Error('Invalid session claims');
    }
    return payload.sub;
  } catch {
    throw new HttpError(401, 'UNAUTHENTICATED', 'Please sign in to continue.');
  }
}
export async function setSession(res: Response, userId: string, env: Environment): Promise<void> {
  res.cookie(SESSION_COOKIE, await createSession(userId, env), {
    ...cookieOptions(env), maxAge: env.JWT_TTL_SECONDS * 1000,
  });
}
