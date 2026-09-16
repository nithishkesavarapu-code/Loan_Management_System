import type { Request } from 'express';
import { z } from 'zod';
import { HttpError } from './errors.js';

export function assertJsonContent(req: Request): void {
  const hasBody = Number(req.headers['content-length'] ?? 0) > 0 || !!req.headers['transfer-encoding'];
  if (hasBody && !req.is('application/json')) throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Use application/json for this request.');
}
export function emptyMutation(req: Request): void {
  assertJsonContent(req);
  z.strictObject({}).parse(req.query);
  z.strictObject({}).parse(req.body ?? {});
}
export function noBody(req: Request): void {
  if (Number(req.headers['content-length'] ?? 0) > 0 || req.headers['transfer-encoding']) {
    throw new HttpError(400, 'MALFORMED_REQUEST', 'This request does not accept a body.');
  }
}
