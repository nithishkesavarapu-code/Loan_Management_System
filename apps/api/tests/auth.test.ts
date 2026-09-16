import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SignJWT, type JWTPayload } from 'jose';
import { authRequestSchema } from '@lms/shared';
import { cookieOptions, createSession, verifySession } from '../src/modules/auth/session.js';
import { HttpError } from '../src/middleware/errors.js';
import { testEnv } from './fixtures.js';

test('credentials normalize only email and enforce Unicode character and bcrypt byte limits', () => {
  assert.deepEqual(authRequestSchema.parse({ email: ' Test@Example.TEST ', password: ' password ' }), { email: 'test@example.test', password: ' password ' });
  for (const password of ['1234567', 'a'.repeat(73), '\u{1F600}'.repeat(7), '\u{1F600}'.repeat(19)]) {
    assert.equal(authRequestSchema.safeParse({ email: 'test@example.test', password }).success, false);
  }
  for (const password of ['a'.repeat(72), '\u{1F600}'.repeat(18), '        ']) {
    assert.equal(authRequestSchema.safeParse({ email: 'test@example.test', password }).success, true);
  }
  assert.equal(authRequestSchema.safeParse({ email: { $ne: null }, password: '12345678' }).success, false);
});

test('JWT sessions require signed, bounded, correctly scoped identity claims', async () => {
  const id = '1234567890abcdef12345678';
  const valid = await createSession(id, testEnv);
  assert.equal(await verifySession(valid, testEnv), id);
  const now = Math.floor(Date.now() / 1000);
  const key = new TextEncoder().encode(testEnv.JWT_SECRET);
  const claims = { sub: id, iss: 'lms-api', aud: 'lms-web', iat: now, exp: now + 3600 };
  const invalid: unknown[] = [undefined, '', {}, `${valid.slice(0, -12)}aaaaaaaaaaaa`];
  for (const overrides of [
    { iss: 'other' }, { aud: 'other' }, { sub: 'invalid-id' }, { exp: now - 1 },
    { exp: now + 7200 }, { iat: now + 100 }, { iat: undefined }, { exp: undefined }, { sub: undefined },
  ]) {
    const payload: JWTPayload = { ...claims };
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) delete payload[key];
      else payload[key] = value;
    }
    invalid.push(await new SignJWT(payload).setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).sign(key));
  }
  invalid.push(await new SignJWT(claims).setProtectedHeader({ alg: 'HS512', typ: 'JWT' }).sign(key));
  invalid.push(await new SignJWT(claims).setProtectedHeader({ alg: 'HS256', typ: 'other' }).sign(key));
  invalid.push(await new SignJWT(claims).setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).sign(new TextEncoder().encode('wrong-secret')));
  for (const token of invalid) await assert.rejects(verifySession(token, testEnv), (error: unknown) => error instanceof HttpError && error.status === 401);
});

test('cookie security is host-only, HttpOnly, SameSite Lax, and Secure under HTTPS', () => {
  assert.deepEqual(cookieOptions(testEnv), { httpOnly: true, secure: false, sameSite: 'lax', path: '/' });
  assert.equal(cookieOptions({ ...testEnv, COOKIE_SECURE: true }).secure, true);
});
