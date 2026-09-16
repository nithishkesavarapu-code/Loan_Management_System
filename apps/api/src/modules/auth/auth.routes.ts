import { json, Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { authRequestSchema, SESSION_COOKIE, type ApiSuccess, type UserDTO } from '@lms/shared';
import type { Environment } from '../../config/env.js';
import { authenticate, currentUser } from '../../middleware/auth.js';
import { HttpError } from '../../middleware/errors.js';
import { login, register } from './auth.service.js';
import { cookieOptions, setSession } from './session.js';

const requireJson: RequestHandler = (req, _res, next) => {
  if (!req.is('application/json')) throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Use application/json for this request.');
  next();
};
export function authRoutes(env: Environment): Router {
  const router = Router();
  const parseJson = json({ limit: '100kb' });
  router.post('/register', requireJson, parseJson, async (req, res) => {
    z.strictObject({}).parse(req.query);
    const user = await register(authRequestSchema.parse(req.body));
    await setSession(res, user.id, env);
    res.status(201).json({ data: user } satisfies ApiSuccess<UserDTO>);
  });
  router.post('/login', requireJson, parseJson, async (req, res) => {
    z.strictObject({}).parse(req.query);
    const user = await login(authRequestSchema.parse(req.body));
    await setSession(res, user.id, env);
    res.json({ data: user } satisfies ApiSuccess<UserDTO>);
  });
  router.post('/logout', authenticate(env), parseJson, (req, res) => {
    z.strictObject({}).parse(req.query);
    if (req.headers['transfer-encoding'] || Number(req.headers['content-length'] ?? 0) > 0) {
      if (!req.is('application/json')) throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Use an empty body or an empty JSON object.');
    }
    z.strictObject({}).parse(req.body ?? {});
    res.clearCookie(SESSION_COOKIE, cookieOptions(env)).status(204).end();
  });
  router.get('/me', authenticate(env), (req, res) => {
    z.strictObject({}).parse(req.query);
    res.json({ data: currentUser(req) } satisfies ApiSuccess<UserDTO>);
  });
  return router;
}
