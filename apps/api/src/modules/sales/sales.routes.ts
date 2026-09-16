import { Router } from 'express';
import { z } from 'zod';
import { salesListQuerySchema } from '@lms/shared';
import { noBody } from '../../middleware/requests.js';
import { getLead, listLeads } from './sales.service.js';

export const salesRoutes = Router();
salesRoutes.get('/leads', async (req, res) => {
  noBody(req);
  res.json(await listLeads(salesListQuerySchema.parse(req.query), new Date()));
});
salesRoutes.get('/leads/:id', async (req, res) => {
  noBody(req); z.strictObject({}).parse(req.query);
  res.json({ data: await getLead(z.string().parse(req.params.id), new Date()) });
});
