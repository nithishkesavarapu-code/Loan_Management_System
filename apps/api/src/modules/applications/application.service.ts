import {
  applicationNextStep, pageOffset, type ApplicationDTO, type ApplicationListQuery, type DocumentDTO,
  type EligibilityResult, type Page, type PersonalDetailsDraft, type UpdateApplicationRequest,
} from '@lms/shared';
import { Application, type ApplicationDocument } from './application.model.js';
import { Document } from '../documents/document.model.js';
import { Loan } from '../loans/loan.model.js';
import { objectId, ownedApplication } from '../../middleware/ownership.js';
import { HttpError } from '../../middleware/errors.js';
import { evaluateEligibility } from './eligibility.js';

export function personalDetails(record: ApplicationDocument['personalDetails']): PersonalDetailsDraft {
  return { fullName: record.fullName ?? null, pan: record.pan ?? null, dob: record.dob ?? null,
    monthlySalaryPaise: record.monthlySalaryPaise ?? null, employmentMode: record.employmentMode ?? null };
}
export function assertDraft(record: ApplicationDocument): void {
  if (record.state !== 'DRAFT') throw new HttpError(409, 'APPLICATION_LOCKED', 'This application has already been submitted and cannot be edited.');
}

export async function applicationDTOs(records: ApplicationDocument[], now: Date): Promise<ApplicationDTO[]> {
  if (!records.length) return [];
  const documents = await Document.find({ _id: { $in: records.flatMap((record) => record.salarySlipId ? [record.salarySlipId] : []) } });
  const loans = await Loan.find({ applicationId: { $in: records.map((record) => record._id) } }).select('_id applicationId borrowerId');
  return records.map((record) => {
    const details = personalDetails(record.personalDetails);
    const stored = record.eligibilityAtSubmission;
    if (record.state === 'SUBMITTED' && !stored) throw new Error('Submitted application has no eligibility snapshot.');
    const eligibility: EligibilityResult = record.state === 'DRAFT' ? evaluateEligibility(details, now) : {
      eligible: stored!.eligible, evaluatedAt: stored!.evaluatedAt.toISOString(), ageYears: stored!.ageYears ?? null,
      failures: stored!.failures.map(({ field, code, message }) => ({ field: field as keyof PersonalDetailsDraft, code, message })),
    };
    const document = documents.find((item) => item._id.equals(record.salarySlipId) && item.borrowerId.equals(record.borrowerId) && item.applicationId.equals(record._id));
    const salarySlip: DocumentDTO | null = document ? {
      id: document.id, originalName: document.originalName, mimeType: document.detectedMimeType,
      sizeBytes: document.sizeBytes, createdAt: document.createdAt.toISOString(),
    } : null;
    return {
      id: record.id, borrowerId: record.borrowerId.toHexString(), state: record.state, personalDetails: details,
      loanConfig: { principalPaise: record.principalPaise, tenureDays: record.tenureDays }, salarySlip, eligibility,
      nextStep: applicationNextStep(eligibility.eligible, salarySlip !== null, record.state),
      loanId: loans.find((loan) => loan.applicationId.equals(record._id) && loan.borrowerId.equals(record.borrowerId))?.id ?? null,
      submittedAt: record.submittedAt?.toISOString() ?? null, createdAt: record.createdAt.toISOString(), updatedAt: record.updatedAt.toISOString(),
    };
  });
}

export async function startDraft(borrowerId: string, now: Date): Promise<{ created: boolean; data: ApplicationDTO }> {
  const filter = { borrowerId: objectId(borrowerId), state: 'DRAFT' as const };
  const existing = await Application.findOne(filter);
  if (existing) return { created: false, data: (await applicationDTOs([existing], now))[0]! };
  try {
    const record = await Application.create(filter);
    return { created: true, data: (await applicationDTOs([record], now))[0]! };
  } catch (error) {
    if (typeof error !== 'object' || error === null || !('code' in error) || error.code !== 11000) throw error;
    const record = await Application.findOne(filter);
    if (!record) throw new HttpError(503, 'RETRYABLE_CONFLICT', 'The draft changed while it was opening. Please retry.');
    return { created: false, data: (await applicationDTOs([record], now))[0]! };
  }
}

export async function listApplications(borrowerId: string, query: ApplicationListQuery, now: Date): Promise<Page<ApplicationDTO>> {
  const filter = { borrowerId: objectId(borrowerId), ...(query.state ? { state: query.state } : {}) };
  const records = await Application.find(filter).sort({ createdAt: -1, _id: -1 }).skip(pageOffset(query)).limit(query.limit);
  const total = await Application.countDocuments(filter);
  return { data: await applicationDTOs(records, now), pagination: { page: query.page, limit: query.limit, total } };
}
export async function getApplication(id: string, borrowerId: string, now: Date): Promise<ApplicationDTO> {
  return (await applicationDTOs([await ownedApplication(id, borrowerId)], now))[0]!;
}

export async function updateApplication(id: string, borrowerId: string, input: UpdateApplicationRequest, now: Date): Promise<ApplicationDTO> {
  const filter = { _id: objectId(id), borrowerId: objectId(borrowerId) };
  const updates: Record<string, string | number | null> = {};
  for (const [field, value] of Object.entries(input.personalDetails ?? {})) {
    if (value !== undefined) updates[`personalDetails.${field}`] = value;
  }
  if (input.loanConfig?.principalPaise !== undefined) updates.principalPaise = input.loanConfig.principalPaise;
  if (input.loanConfig?.tenureDays !== undefined) updates.tenureDays = input.loanConfig.tenureDays;
  const record = await Application.findOneAndUpdate({ ...filter, state: 'DRAFT' }, { $set: updates }, {
    returnDocument: 'after', runValidators: true,
  });
  if (!record) { assertDraft(await ownedApplication(id, borrowerId)); throw new HttpError(409, 'APPLICATION_LOCKED', 'The application changed. Please reload.'); }
  return (await applicationDTOs([record], now))[0]!;
}

export async function evaluateApplication(id: string, borrowerId: string, now: Date): Promise<EligibilityResult> {
  const record = await ownedApplication(id, borrowerId);
  assertDraft(record);
  return evaluateEligibility(personalDetails(record.personalDetails), now);
}
