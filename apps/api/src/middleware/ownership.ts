import { Types } from 'mongoose';
import { Application } from '../modules/applications/application.model.js';
import { Loan } from '../modules/loans/loan.model.js';
import { Document } from '../modules/documents/document.model.js';
import { HttpError } from './errors.js';

export function objectId(value: string): Types.ObjectId {
  if (!/^[a-f\d]{24}$/i.test(value)) throw new HttpError(400, 'MALFORMED_REQUEST', 'The resource ID is invalid.');
  return new Types.ObjectId(value);
}
export async function ownedApplication(id: string, borrowerId: string) {
  const record = await Application.findOne({ _id: objectId(id), borrowerId: objectId(borrowerId) });
  if (!record) throw new HttpError(404, 'NOT_FOUND', 'The requested resource was not found.');
  return record;
}
export async function ownedLoan(id: string, borrowerId: string) {
  const record = await Loan.findOne({ _id: objectId(id), borrowerId: objectId(borrowerId) });
  if (!record) throw new HttpError(404, 'NOT_FOUND', 'The requested resource was not found.');
  return record;
}
export async function ownedDocument(id: string, borrowerId: string) {
  const record = await Document.findOne({ _id: objectId(id), borrowerId: objectId(borrowerId) });
  if (!record) throw new HttpError(404, 'NOT_FOUND', 'The requested resource was not found.');
  return record;
}
