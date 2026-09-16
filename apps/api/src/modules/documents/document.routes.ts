import { Router } from 'express';
import { pipeline } from 'node:stream/promises';
import { z } from 'zod';
import type { Environment } from '../../config/env.js';
import { currentUser } from '../../middleware/auth.js';
import { noBody } from '../../middleware/requests.js';
import { assertUploadAllowed, attachSalarySlip, authorizedDocument } from './document.service.js';
import { DocumentStorage, documentUnavailable, safeOriginalName } from './document.storage.js';

export function documentRoutes(env: Environment) {
  const router = Router();
  const storage = new DocumentStorage(env.UPLOAD_DIR);
  router.post('/borrower/applications/:id/salary-slip', async (req, res) => {
    z.strictObject({}).parse(req.query);
    const user = currentUser(req);
    await assertUploadAllowed(req.params.id, user.id);
    const file = await storage.receive(req, res);
    const data = await attachSalarySlip(storage, req.params.id, user.id, file);
    res.status(201).json({ data });
  });
  router.get('/documents/:id', async (req, res, next) => {
    z.strictObject({}).parse(req.query); noBody(req);
    const document = await authorizedDocument(req.params.id, currentUser(req));
    const file = await storage.open(document.storageKey, document.sizeBytes);
    res.attachment(safeOriginalName(document.originalName));
    res.set({ 'Content-Type': document.detectedMimeType, 'Content-Length': String(document.sizeBytes), 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' });
    try { await pipeline(file.createReadStream(), res); }
    catch { if (!res.destroyed) next(documentUnavailable()); }
    finally { await file.close(); }
  });
  return router;
}
