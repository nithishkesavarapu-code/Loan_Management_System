import { type Role, loanStatuses, pageOffset, type DisbursementLoanListQuery, type LoanStatus, type Page, type ReviewedLoanDetail, type SanctionDecision, type SanctionLoanListQuery, type LoanDetail, type LoanSummary } from '@lms/shared';
import { Document } from '../documents/document.model.js';
import { documentUnavailable } from '../documents/document.storage.js';
import { objectId } from '../../middleware/ownership.js';
import { HttpError } from '../../middleware/errors.js';
import { Loan, type LoanDocument } from './loan.model.js';
import { loanDetail, loanSummary, reviewedLoan } from './loan.service.js';

const disbursementStatuses = ['SANCTIONED', 'DISBURSED', 'CLOSED'] as const;
type QueueQuery = { page: number; limit: number; q?: string | undefined; status: string };

function nameOrEmailFilter(q?: string) {
  if (!q) return {};
  const needle = q.toLocaleLowerCase('en-US');
  return { $expr: { $or: ['applicantSnapshot.fullName', 'applicantSnapshot.email'].map((field) => ({
    $gte: [{ $indexOfCP: [{ $toLower: `$${field}` }, { $literal: needle }] }, 0],
  })) } };
}
async function listQueue(query: QueueQuery, readable: readonly LoanStatus[]): Promise<Page<LoanSummary>> {
  const statuses = query.status === 'ALL' ? readable : [query.status as LoanStatus];
  const filter = { status: { $in: statuses }, ...nameOrEmailFilter(query.q) };
  const [records, total] = await Promise.all([
    Loan.find(filter).sort({ createdAt: -1, _id: -1 }).skip(pageOffset(query)).limit(query.limit),
    Loan.countDocuments(filter),
  ]);
  return { data: records.map(loanSummary), pagination: { page: query.page, limit: query.limit, total } };
}
async function unavailableOrConflict(id: string): Promise<never> {
  if (await Loan.exists({ _id: objectId(id) })) {
    throw new HttpError(409, 'INVALID_LOAN_STATE', 'This loan is no longer available for that action. Refresh the page.');
  }
  throw new HttpError(404, 'NOT_FOUND', 'The requested loan was not found.');
}
async function reviewed(record: LoanDocument): Promise<ReviewedLoanDetail> {
  const slip = await Document.findOne({ _id: record.salarySlipId, borrowerId: record.borrowerId, applicationId: record.applicationId });
  if (!slip) throw documentUnavailable();
  return reviewedLoan(record, slip);
}

export function listSanctionLoans(query: SanctionLoanListQuery) { return listQueue(query, loanStatuses); }
export function listDisbursementLoans(query: DisbursementLoanListQuery) { return listQueue(query, disbursementStatuses); }

export async function getSanctionLoan(id: string): Promise<ReviewedLoanDetail> {
  const loan = await Loan.findById(objectId(id));
  if (!loan) throw new HttpError(404, 'NOT_FOUND', 'The requested loan was not found.');
  return reviewed(loan);
}
export async function getDisbursementLoan(id: string): Promise<LoanDetail> {
  const loan = await Loan.findOne({ _id: objectId(id), status: { $in: disbursementStatuses } });
  if (!loan) throw new HttpError(404, 'NOT_FOUND', 'The requested loan was not found.');
  return loanDetail(loan);
}
export async function decideLoan(id: string, actor: { id: string; role: Role }, decision: SanctionDecision): Promise<ReviewedLoanDetail> {
  const now = new Date();
  const approved = decision.decision === 'APPROVE';
  const loan = await Loan.findOneAndUpdate({ _id: objectId(id), status: 'APPLIED' }, {
    $set: approved ? { status: 'SANCTIONED', sanctionedAt: now, rejectionReason: null } : { status: 'REJECTED', rejectionReason: decision.reason },
    $push: { statusHistory: { fromStatus: 'APPLIED', toStatus: approved ? 'SANCTIONED' : 'REJECTED', actorId: objectId(actor.id), actorRole: actor.role, occurredAt: now, reason: approved ? null : decision.reason } },
  }, { returnDocument: 'after', runValidators: true });
  if (!loan) return unavailableOrConflict(id);
  return reviewed(loan);
}
export async function disburseLoan(id: string, actor: { id: string; role: Role }): Promise<LoanDetail> {
  const now = new Date();
  const loan = await Loan.findOneAndUpdate({ _id: objectId(id), status: 'SANCTIONED' }, {
    $set: { status: 'DISBURSED', disbursedAt: now },
    $push: { statusHistory: { fromStatus: 'SANCTIONED', toStatus: 'DISBURSED', actorId: objectId(actor.id), actorRole: actor.role, occurredAt: now, reason: null } },
  }, { returnDocument: 'after', runValidators: true });
  if (!loan) return unavailableOrConflict(id);
  return loanDetail(loan);
}
