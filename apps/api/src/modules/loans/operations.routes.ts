import { Router } from 'express';
import { z } from 'zod';
import { disbursementLoanListQuerySchema, sanctionDecisionSchema, sanctionLoanListQuerySchema } from '@lms/shared';
import { currentUser } from '../../middleware/auth.js';
import { assertJsonContent, emptyMutation, noBody } from '../../middleware/requests.js';
import { decideLoan, disburseLoan, getDisbursementLoan, getSanctionLoan, listDisbursementLoans, listSanctionLoans } from './operations.service.js';

export const sanctionRoutes = Router();
sanctionRoutes.get('/loans', async (req, res) => {
  noBody(req);
  res.json(await listSanctionLoans(sanctionLoanListQuerySchema.parse(req.query)));
});
sanctionRoutes.get('/loans/:id', async (req, res) => {
  noBody(req); z.strictObject({}).parse(req.query);
  res.json({ data: await getSanctionLoan(req.params.id) });
});
sanctionRoutes.post('/loans/:id/decision', async (req, res) => {
  assertJsonContent(req); z.strictObject({}).parse(req.query);
  res.json({ data: await decideLoan(req.params.id, currentUser(req), sanctionDecisionSchema.parse(req.body)) });
});

export const disbursementRoutes = Router();
disbursementRoutes.get('/loans', async (req, res) => {
  noBody(req);
  res.json(await listDisbursementLoans(disbursementLoanListQuerySchema.parse(req.query)));
});
disbursementRoutes.get('/loans/:id', async (req, res) => {
  noBody(req); z.strictObject({}).parse(req.query);
  res.json({ data: await getDisbursementLoan(req.params.id) });
});
disbursementRoutes.post('/loans/:id/disburse', async (req, res) => {
  emptyMutation(req);
  res.json({ data: await disburseLoan(req.params.id, currentUser(req)) });
});
