import type { Request, RequestHandler } from 'express';
import { SESSION_COOKIE, type Role, type UserDTO } from '@lms/shared';
import type { Environment } from '../config/env.js';
import { User } from '../modules/auth/user.model.js';
import { toUserDTO } from '../modules/auth/auth.service.js';
import { verifySession } from '../modules/auth/session.js';
import { HttpError } from './errors.js';

declare module 'express-serve-static-core' {
  interface Request { currentUser?: UserDTO }
}
export function authenticate(env: Environment): RequestHandler {
  return async (req, _res, next) => {
    const token: unknown = req.cookies?.[SESSION_COOKIE];
    const id = await verifySession(token, env);
    const user = await User.findById(id);
    if (!user) throw new HttpError(401, 'UNAUTHENTICATED', 'Please sign in to continue.');
    req.currentUser = toUserDTO(user);
    next();
  };
}
export function currentUser(req: Request): UserDTO {
  if (!req.currentUser) throw new HttpError(401, 'UNAUTHENTICATED', 'Please sign in to continue.');
  return req.currentUser;
}
export function requireRoles(...roles: readonly Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!roles.includes(currentUser(req).role)) throw new HttpError(403, 'FORBIDDEN', 'You do not have access to this area.');
    next();
  };
}
export function protectMutations(env: Environment): RequestHandler {
  return (req, _res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)
      && (req.get('Origin') !== env.WEB_ORIGIN || req.get('X-LMS-Request') !== '1')) {
      throw new HttpError(403, 'CSRF_REJECTED', 'The request origin or security header is invalid.');
    }
    next();
  };
}
