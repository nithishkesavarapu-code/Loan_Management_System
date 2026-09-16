import { User } from '../modules/auth/user.model.js';
import { Application } from '../modules/applications/application.model.js';
import { Document } from '../modules/documents/document.model.js';
import { Loan } from '../modules/loans/loan.model.js';
import { Payment } from '../modules/payments/payment.model.js';

export async function ensureIndexes(): Promise<void> {
  for (const model of [User, Application, Document, Loan, Payment]) {
    await model.createIndexes();
  }
}
