import mongoose, { Types } from 'mongoose';
import type { DocumentDTO, UserDTO } from '@lms/shared';
import { Application } from '../applications/application.model.js';
import { assertDraft, personalDetails } from '../applications/application.service.js';
import { requireEligibility } from '../applications/eligibility.js';
import { Loan } from '../loans/loan.model.js';
import { objectId, ownedApplication } from '../../middleware/ownership.js';
import { HttpError } from '../../middleware/errors.js';
import { Document } from './document.model.js';
import type { DocumentStorage } from './document.storage.js';

export async function assertUploadAllowed(id: string, borrowerId: string): Promise<void> {
  const application = await ownedApplication(id, borrowerId);
  assertDraft(application);
  requireEligibility(personalDetails(application.personalDetails), new Date());
}

async function removeUnreferenced(storage: DocumentStorage, id: Types.ObjectId, key: string): Promise<void> {
  try {
    if (await Application.exists({ salarySlipId: id })) return;
    if (await Loan.exists({ salarySlipId: id })) return;
    await storage.remove(key);
    await Document.deleteOne({ _id: id, storageKey: key });
  } catch { console.error('Unreferenced document cleanup deferred; storage reconciliation may be needed.'); }
}

export async function attachSalarySlip(storage: DocumentStorage, applicationId: string, borrowerId: string, file: Awaited<ReturnType<DocumentStorage['receive']>>): Promise<DocumentDTO> {
  const id = new Types.ObjectId();
  let previous: { id: Types.ObjectId; key: string } | undefined;
  try {
    const result = await mongoose.connection.transaction(async (session) => {
      previous = undefined;
      const application = await Application.findOne({ _id: objectId(applicationId), borrowerId: objectId(borrowerId) }).session(session);
      if (!application) throw new HttpError(404, 'NOT_FOUND', 'Application not found.');
      assertDraft(application);
      requireEligibility(personalDetails(application.personalDetails), new Date());
      if (await Loan.exists({ applicationId: application._id }).session(session) ||
        (application.salarySlipId && await Loan.exists({ salarySlipId: application.salarySlipId }).session(session))) {
        throw new HttpError(409, 'APPLICATION_LOCKED', 'A submitted loan references this application or document.');
      }
      if (application.salarySlipId) {
        const old = await Document.findOne({ _id: application.salarySlipId, applicationId: application._id, borrowerId: application.borrowerId }).session(session);
        if (old) previous = { id: old._id, key: old.storageKey };
      }
      const document = new Document({ _id: id, applicationId: application._id, borrowerId: application.borrowerId,
        storageKey: file.key, originalName: file.originalName, detectedMimeType: file.mimeType, sizeBytes: file.sizeBytes });
      await document.save({ session });
      const updated = await Application.updateOne({ _id: application._id, state: 'DRAFT' }, { $set: { salarySlipId: id } }, { session, runValidators: true });
      if (updated.modifiedCount !== 1) throw new HttpError(409, 'APPLICATION_LOCKED', 'The application changed. Please reload.');
      return { id: id.toHexString(), originalName: file.originalName, mimeType: file.mimeType, sizeBytes: file.sizeBytes, createdAt: document.createdAt.toISOString() };
    });
    if (previous) await removeUnreferenced(storage, previous.id, previous.key);
    return result;
  } catch (error) {
    const uncertainCommit = error instanceof mongoose.mongo.MongoError && error.hasErrorLabel('UnknownTransactionCommitResult');
    if (uncertainCommit) console.error('Document commit outcome is uncertain; retain bytes for reconciliation.');
    else await removeUnreferenced(storage, id, file.key);
    throw error;
  }
}

export async function authorizedDocument(id: string, user: UserDTO) {
  const record = await Document.findById(objectId(id));
  const missing = () => new HttpError(404, 'NOT_FOUND', 'Document not found.');
  if (!record || (user.role === 'BORROWER' && !record.borrowerId.equals(user.id))) throw missing();
  const linkedLoan = await Loan.exists({ salarySlipId: record._id, applicationId: record.applicationId, borrowerId: record.borrowerId });
  if (user.role === 'BORROWER') {
    const linkedApplication = await Application.exists({ _id: record.applicationId, borrowerId: record.borrowerId, salarySlipId: record._id });
    if (!linkedApplication && !linkedLoan) throw missing();
  } else if (user.role === 'SANCTION' || user.role === 'ADMIN') {
    if (!linkedLoan) throw missing();
  } else throw new HttpError(403, 'FORBIDDEN', 'You do not have permission to access documents.');
  return record;
}
