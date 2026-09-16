import { Router } from 'express';
import { z } from 'zod';
import { borrowerLoanListQuerySchema } from '@lms/shared';
import type { Environment } from '../../config/env.js';
import { currentUser } from '../../middleware/auth.js';
import { emptyMutation, noBody } from '../../middleware/requests.js';
import { DocumentStorage } from '../documents/document.storage.js';
import { getBorrowerLoan, listBorrowerLoans, submitApplication } from './loan.service.js';
import { borrowerPaymentRoutes } from '../payments/payment.routes.js';

export function borrowerLoanRoutes(env: Environment) {
  const router = Router();
  const storage = new DocumentStorage(env.UPLOAD_DIR);
  router.post('/applications/:id/submit', async (req, res) => {
    emptyMutation(req);
    const data = await submitApplication(req.params.id, currentUser(req).id, storage);
    res.location(`/api/v1/borrower/loans/${data.id}`).status(201).json({ data });
  });
  router.get('/loans', async (req, res) => {
    noBody(req);
    res.json(await listBorrowerLoans(currentUser(req).id, borrowerLoanListQuerySchema.parse(req.query)));
  });
  router.get('/loans/:id', async (req, res) => {
    noBody(req); z.strictObject({}).parse(req.query);
    res.json({ data: await getBorrowerLoan(req.params.id, currentUser(req).id) });
  });
  router.use(borrowerPaymentRoutes);
  return router;
}
