import mongoose, { type HydratedDocument, type InferSchemaType } from 'mongoose';
import { calculateLoan, loanConfigurationSchema, loanDetailSchema, loanSummarySchema, pageOffset, reviewedLoanDetailSchema, type BorrowerLoanListQuery, type LoanDetail, type LoanSummary, type ReviewedLoanDetail, type Page } from '@lms/shared';
import { Loan, type LoanDocument } from './loan.model.js';
import { Application } from '../applications/application.model.js';
import { personalDetails } from '../applications/application.service.js';
import { requireEligibility } from '../applications/eligibility.js';
import { User } from '../auth/user.model.js';
import { Document } from '../documents/document.model.js';
import { DocumentStorage, documentUnavailable } from '../documents/document.storage.js';
import { objectId, ownedLoan } from '../../middleware/ownership.js';
import { HttpError } from '../../middleware/errors.js';

export function loanSummary(record: LoanDocument): LoanSummary {
  return loanSummarySchema.parse({
    id: record.id, applicationId: record.applicationId.toHexString(),
    borrower: { id: record.borrowerId.toHexString(), fullName: record.applicantSnapshot.fullName, email: record.applicantSnapshot.email },
    status: record.status, principalPaise: record.principalPaise, annualRatePercent: record.annualRatePercent,
    tenureDays: record.tenureDays, interestPaise: record.interestPaise, totalRepaymentPaise: record.totalRepaymentPaise,
    totalPaidPaise: record.totalPaidPaise, outstandingPaise: record.totalRepaymentPaise - record.totalPaidPaise, createdAt: record.createdAt.toISOString(),
  });
}
export function loanDetail(record: LoanDocument): LoanDetail {
  return loanDetailSchema.parse({
    ...loanSummary(record), rejectionReason: record.rejectionReason ?? null,
    sanctionedAt: record.sanctionedAt?.toISOString() ?? null, disbursedAt: record.disbursedAt?.toISOString() ?? null,
    closedAt: record.closedAt?.toISOString() ?? null, updatedAt: record.updatedAt.toISOString(),
    statusHistory: record.statusHistory.map((event) => ({ fromStatus: event.fromStatus ?? null, toStatus: event.toStatus, actorId: event.actorId.toHexString(), actorRole: event.actorRole, occurredAt: event.occurredAt.toISOString(), reason: event.reason ?? null })),
  });
}
export function reviewedLoan(record: LoanDocument, slip: HydratedDocument<InferSchemaType<typeof Document.schema>>): ReviewedLoanDetail {
  const snapshot = record.applicantSnapshot;
  const eligibility = record.eligibilityAtSubmission;
  return reviewedLoanDetailSchema.parse({
    ...loanDetail(record),
    applicantSnapshot: { fullName: snapshot.fullName, email: snapshot.email, pan: snapshot.pan, dob: snapshot.dob, monthlySalaryPaise: snapshot.monthlySalaryPaise, employmentMode: snapshot.employmentMode },
    eligibilityAtSubmission: { eligible: eligibility.eligible, evaluatedAt: eligibility.evaluatedAt.toISOString(), ageYears: eligibility.ageYears ?? null,
      failures: eligibility.failures.map(({ field, code, message }) => ({ field, code, message })) },
    salarySlip: { id: slip.id, originalName: slip.originalName, mimeType: slip.detectedMimeType, sizeBytes: slip.sizeBytes, createdAt: slip.createdAt.toISOString() },
  });
}
function alreadySubmitted(id: string) {
  return new HttpError(409, 'APPLICATION_ALREADY_SUBMITTED', 'This application has already been submitted.', { meta: { loanId: id } });
}
export async function submitApplication(id: string, borrowerId: string, storage: DocumentStorage): Promise<ReviewedLoanDetail> {
  const filter = { _id: objectId(id), borrowerId: objectId(borrowerId) };
  try {
    return await mongoose.connection.transaction(async (session) => {
      const application = await Application.findOne(filter).session(session);
      if (!application) throw new HttpError(404, 'NOT_FOUND', 'Application not found.');
      const existing = await Loan.findOne({ applicationId: application._id, borrowerId: application.borrowerId }).session(session);
      if (existing) throw alreadySubmitted(existing.id);
      if (application.state !== 'DRAFT') throw new HttpError(503, 'APPLICATION_UNAVAILABLE', 'The submitted application is unavailable. Please retry.');
      const now = new Date();
      const details = personalDetails(application.personalDetails);
      const eligibility = requireEligibility(details, now);
      const configuration = loanConfigurationSchema.safeParse({ principalPaise: application.principalPaise, tenureDays: application.tenureDays });
      if (!configuration.success) throw new HttpError(422, 'VALIDATION_FAILED', 'The saved loan terms are invalid.', {
        fields: Object.fromEntries(configuration.error.issues.map((issue) => [`loanConfig.${issue.path.join('.')}`, [issue.message]])),
      });
      const terms = calculateLoan(configuration.data);
      if (!application.salarySlipId) throw new HttpError(422, 'SALARY_SLIP_REQUIRED', 'Attach a salary slip before applying.');
      const slip = await Document.findOne({ _id: application.salarySlipId, applicationId: application._id, borrowerId: application.borrowerId }).session(session);
      if (!slip) throw new HttpError(422, 'SALARY_SLIP_REQUIRED', 'A valid salary slip linked to this application is required.');
      const borrower = await User.findOne({ _id: application.borrowerId, role: 'BORROWER' }).session(session);
      if (!borrower) throw new HttpError(401, 'UNAUTHENTICATED', 'Please sign in again.');
      const updated = await Application.updateOne({ ...filter, state: 'DRAFT' }, {
        $set: { state: 'SUBMITTED', submittedAt: now, eligibilityAtSubmission: eligibility },
      }, { session, runValidators: true });
      if (updated.modifiedCount !== 1) throw new HttpError(409, 'APPLICATION_LOCKED', 'The application changed. Please reload.');
      const file = await storage.open(slip.storageKey, slip.sizeBytes);
      await file.close();
      const loan = new Loan({ applicationId: application._id, borrowerId: application.borrowerId,
        applicantSnapshot: { ...details, email: borrower.email }, eligibilityAtSubmission: eligibility, salarySlipId: slip._id,
        ...terms, totalPaidPaise: 0, status: 'APPLIED', statusHistory: [{ fromStatus: null, toStatus: 'APPLIED', actorId: borrower._id, actorRole: 'BORROWER', occurredAt: now, reason: null }] });
      await loan.save({ session });
      return reviewedLoan(loan, slip);
    }, { readPreference: 'primary', readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
  } catch (error) {
    if (error instanceof mongoose.mongo.MongoError && error.hasErrorLabel('UnknownTransactionCommitResult')) {
      throw new HttpError(503, 'SUBMISSION_UNCONFIRMED', 'Submission could not be confirmed. Refresh the application before retrying.');
    }
    if (error instanceof mongoose.mongo.MongoServerError && error.code === 11000) {
      const existing = await Loan.findOne({ applicationId: filter._id, borrowerId: filter.borrowerId });
      if (existing) throw alreadySubmitted(existing.id);
    }
    throw error;
  }
}
export async function listBorrowerLoans(borrowerId: string, query: BorrowerLoanListQuery): Promise<Page<LoanSummary>> {
  const filter = { borrowerId: objectId(borrowerId), ...(query.status === 'ALL' ? {} : { status: query.status }) };
  const records = await Loan.find(filter).sort({ createdAt: -1, _id: -1 }).skip(pageOffset(query)).limit(query.limit);
  const total = await Loan.countDocuments(filter);
  return { data: records.map(loanSummary), pagination: { page: query.page, limit: query.limit, total } };
}
export async function getBorrowerLoan(id: string, borrowerId: string): Promise<ReviewedLoanDetail> {
  const loan = await ownedLoan(id, borrowerId);
  const slip = await Document.findOne({ _id: loan.salarySlipId, borrowerId: loan.borrowerId, applicationId: loan.applicationId });
  if (!slip) throw documentUnavailable();
  return reviewedLoan(loan, slip);
}
