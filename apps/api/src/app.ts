import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { z } from 'zod';
import type { RequestHandler } from 'express';
import type { ApiSuccess, HealthDTO } from '@lms/shared';
import { assertDatabaseReady } from './config/database.js';
import { errorHandler, HttpError, notFound } from './middleware/errors.js';
import type { Environment } from './config/env.js';
import { authenticate, protectMutations, requireRoles } from './middleware/auth.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { dashboardModules, moduleRoles } from '@lms/shared';
import { applicationRoutes } from './modules/applications/application.routes.js';
import { salesRoutes } from './modules/sales/sales.routes.js';
import { documentRoutes } from './modules/documents/document.routes.js';
import { borrowerLoanRoutes } from './modules/loans/loan.routes.js';
import { disbursementRoutes, sanctionRoutes } from './modules/loans/operations.routes.js';
import { collectionRoutes } from './modules/payments/payment.routes.js';

export function createApp(env: Environment, checkDatabase: () => Promise<void> = assertDatabaseReady) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(protectMutations(env));
  app.use(cookieParser());

  app.get('/api/v1/health', async (req, res) => {
    z.strictObject({}).parse(req.query);
    try {
      await checkDatabase();
    } catch {
      throw new HttpError(503, 'DEPENDENCY_UNAVAILABLE', 'The database is not ready.');
    }
    const response: ApiSuccess<HealthDTO> = { data: { status: 'ok', database: 'connected' } };
    res.json(response);
  });

  app.use('/api/v1/auth', authRoutes(env));
  app.use('/api/v1/borrower', authenticate(env), requireRoles('BORROWER'));
  for (const module of dashboardModules) {
    app.use(`/api/v1/${module}`, authenticate(env), requireRoles(...moduleRoles[module]));
  }
  app.use('/api/v1/documents', authenticate(env), requireRoles('BORROWER', 'SANCTION', 'ADMIN'));
  app.use(express.json({ limit: '100kb' }));
  app.use('/api/v1/borrower/applications', applicationRoutes);
  app.use('/api/v1/borrower', borrowerLoanRoutes(env));
  app.use('/api/v1/sales', salesRoutes);
  app.use('/api/v1/sanction', sanctionRoutes);
  app.use('/api/v1/disbursement', disbursementRoutes);
  app.use('/api/v1/collection', collectionRoutes);
  app.use('/api/v1', documentRoutes(env));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
