import type { PipelineStage, Types } from 'mongoose';
import { applicationNextStep, pageOffset, type LeadDetail, type LeadSummary, type Page, type SalesListQuery } from '@lms/shared';
import { User } from '../auth/user.model.js';
import type { ApplicationRecord } from '../applications/application.model.js';
import { evaluateEligibility } from '../applications/eligibility.js';
import { personalDetails } from '../applications/application.service.js';
import { objectId } from '../../middleware/ownership.js';
import { HttpError } from '../../middleware/errors.js';

interface LeadRow { _id: Types.ObjectId; email: string; createdAt: Date; draft?: ApplicationRecord & { _id: Types.ObjectId } }
function leadPipeline(id?: string, q?: string): PipelineStage[] {
  const pipeline: PipelineStage[] = [
    { $match: { role: 'BORROWER', ...(id ? { _id: objectId(id) } : {}) } },
    { $lookup: { from: 'loans', localField: '_id', foreignField: 'borrowerId', pipeline: [{ $limit: 1 }, { $project: { _id: 1 } }], as: 'loans' } },
    { $lookup: { from: 'applications', localField: '_id', foreignField: 'borrowerId', pipeline: [{ $match: { state: 'SUBMITTED' } }, { $limit: 1 }, { $project: { _id: 1 } }], as: 'submitted' } },
    { $match: { 'loans.0': { $exists: false }, 'submitted.0': { $exists: false } } },
    { $lookup: { from: 'applications', localField: '_id', foreignField: 'borrowerId', pipeline: [{ $match: { state: 'DRAFT' } }, { $limit: 1 }], as: 'drafts' } },
    { $set: { draft: { $arrayElemAt: ['$drafts', 0] } } },
  ];
  if (q) pipeline.push({ $match: { $expr: { $or: ['email', 'draft.personalDetails.fullName'].map((field) => ({
    $gte: [{ $indexOfCP: [{ $toLower: { $ifNull: [`$${field}`, ''] } }, { $literal: q.toLowerCase() }] }, 0],
  })) } } });
  pipeline.push({ $project: { _id: 1, email: 1, createdAt: 1, draft: 1 } });
  return pipeline;
}
function toLead(row: LeadRow, now: Date): LeadDetail {
  const draft = row.draft;
  const details = draft ? personalDetails(draft.personalDetails) : null;
  const eligibility = details ? evaluateEligibility(details, now) : null;
  const nextStep = applicationNextStep(eligibility?.eligible ?? false, !!draft?.salarySlipId, 'DRAFT');
  return {
    borrowerId: row._id.toHexString(), email: row.email, fullName: details?.fullName ?? null,
    registeredAt: row.createdAt.toISOString(), draftId: draft?._id.toHexString() ?? null,
    nextStep: nextStep as LeadDetail['nextStep'], eligible: eligibility?.eligible ?? null,
    employmentMode: details?.employmentMode ?? null, eligibility, draftUpdatedAt: draft?.updatedAt.toISOString() ?? null,
  };
}
export async function listLeads(query: SalesListQuery, now: Date): Promise<Page<LeadSummary>> {
  const results = await User.aggregate<{ data: LeadRow[]; count: { total: number }[] }>([
    ...leadPipeline(undefined, query.q),
    { $facet: { data: [{ $sort: { createdAt: -1, _id: -1 } }, { $skip: pageOffset(query) }, { $limit: query.limit }], count: [{ $count: 'total' }] } },
  ]);
  const result = results[0]!;
  const data = result.data.map((row): LeadSummary => {
    const lead = toLead(row, now);
    return { borrowerId: lead.borrowerId, email: lead.email, fullName: lead.fullName, registeredAt: lead.registeredAt,
      draftId: lead.draftId, nextStep: lead.nextStep, eligible: lead.eligible };
  });
  return { data, pagination: { page: query.page, limit: query.limit, total: result.count[0]?.total ?? 0 } };
}
export async function getLead(id: string, now: Date): Promise<LeadDetail> {
  const [row] = await User.aggregate<LeadRow>(leadPipeline(id));
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'The requested lead was not found.');
  return toLead(row, now);
}
