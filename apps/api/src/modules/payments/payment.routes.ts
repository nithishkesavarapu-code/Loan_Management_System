import { Router } from 'express';
import { z } from 'zod';
import { collectionLoanListQuerySchema, paymentListQuerySchema, recordPaymentSchema } from '@lms/shared';
import { currentUser } from '../../middleware/auth.js';
import { assertJsonContent, noBody } from '../../middleware/requests.js';
import { getCollectionLoan, listBorrowerPayments, listCollectionLoans, listCollectionPayments, recordPayment } from './payment.service.js';

export const collectionRoutes = Router();

collectionRoutes.get('/loans', async (req, res) => {
  noBody(req);
  res.json(await listCollectionLoans(collectionLoanListQuerySchema.parse(req.query)));
});
collectionRoutes.get('/loans/:id', async (req, res) => {
  noBody(req); z.strictObject({}).parse(req.query);
  res.json({ data: await getCollectionLoan(req.params.id) });
});
collectionRoutes.get('/loans/:id/payments', async (req, res) => {
  noBody(req);
  res.json(await listCollectionPayments(req.params.id, paymentListQuerySchema.parse(req.query)));
});
collectionRoutes.post('/loans/:id/payments', async (req, res) => {
  assertJsonContent(req); z.strictObject({}).parse(req.query);
  const data = await recordPayment(req.params.id, currentUser(req), recordPaymentSchema.parse(req.body));
  res.location(`/api/v1/collection/loans/${data.loan.id}/payments`).status(201).json({ data });
});

export const borrowerPaymentRoutes = Router();
borrowerPaymentRoutes.get('/loans/:id/payments', async (req, res) => {
  noBody(req);
  res.json(await listBorrowerPayments(req.params.id, currentUser(req).id, paymentListQuerySchema.parse(req.query)));
});
