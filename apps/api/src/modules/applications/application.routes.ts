import { Router } from 'express';
import { z } from 'zod';
import { applicationListQuerySchema, updateApplicationSchema } from '@lms/shared';
import { currentUser } from '../../middleware/auth.js';
import { assertJsonContent, emptyMutation, noBody } from '../../middleware/requests.js';
import { evaluateApplication, getApplication, listApplications, startDraft, updateApplication } from './application.service.js';

export const applicationRoutes = Router();
applicationRoutes.post('/', async (req, res) => {
  emptyMutation(req);
  const result = await startDraft(currentUser(req).id, new Date());
  res.status(result.created ? 201 : 200).json({ data: result.data });
});
applicationRoutes.get('/', async (req, res) => {
  noBody(req);
  res.json(await listApplications(currentUser(req).id, applicationListQuerySchema.parse(req.query), new Date()));
});
applicationRoutes.get('/:id', async (req, res) => {
  noBody(req); z.strictObject({}).parse(req.query);
  res.json({ data: await getApplication(z.string().parse(req.params.id), currentUser(req).id, new Date()) });
});
applicationRoutes.patch('/:id', async (req, res) => {
  assertJsonContent(req); z.strictObject({}).parse(req.query);
  const now = new Date();
  const input = updateApplicationSchema(now).parse(req.body);
  res.json({ data: await updateApplication(z.string().parse(req.params.id), currentUser(req).id, input, now) });
});
applicationRoutes.post('/:id/eligibility', async (req, res) => {
  emptyMutation(req);
  res.json({ data: await evaluateApplication(z.string().parse(req.params.id), currentUser(req).id, new Date()) });
});
