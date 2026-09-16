import { z } from 'zod';
import { loanStatuses, roles, type LoanStatus } from './constants.js';
import { dateOnlySchema, documentSchema, eligibilityResultSchema, loanConfigurationSchema, loanLimits, objectIdSchema, personalFieldSchemas, type LoanConfiguration } from './applications.js';
import { pageSchema, paginationQueryFields } from './pagination.js';

export function calculateLoan(input: LoanConfiguration) {
  const terms = loanConfigurationSchema.parse(input);
  const numerator = BigInt(terms.principalPaise) * BigInt(loanLimits.annualRatePercent) * BigInt(terms.tenureDays);
  const interestPaise = Number((numerator + 18_250n) / 36_500n);
  return { ...terms, annualRatePercent: loanLimits.annualRatePercent, interestPaise, totalRepaymentPaise: terms.principalPaise + interestPaise };
}
export const loanStatusLabels: Record<LoanStatus, string> = {
  APPLIED: 'Pending review', SANCTIONED: 'Sanctioned', REJECTED: 'Rejected', DISBURSED: 'Disbursed', CLOSED: 'Closed',
};
const paise = z.number().int().nonnegative();
export const loanSummarySchema = z.strictObject({
  id: objectIdSchema, applicationId: objectIdSchema,
  borrower: z.strictObject({ id: objectIdSchema, fullName: z.string(), email: z.email() }),
  status: z.enum(loanStatuses), ...loanConfigurationSchema.shape, annualRatePercent: z.literal(12),
  interestPaise: paise, totalRepaymentPaise: paise, totalPaidPaise: paise, outstandingPaise: paise, createdAt: z.iso.datetime(),
});
export const statusEventSchema = z.strictObject({
  fromStatus: z.enum(loanStatuses).nullable(), toStatus: z.enum(loanStatuses), actorId: objectIdSchema,
  actorRole: z.enum(roles), occurredAt: z.iso.datetime(), reason: z.string().nullable(),
});
export const loanDetailSchema = loanSummarySchema.extend({
  rejectionReason: z.string().nullable(), sanctionedAt: z.iso.datetime().nullable(), disbursedAt: z.iso.datetime().nullable(),
  closedAt: z.iso.datetime().nullable(), updatedAt: z.iso.datetime(), statusHistory: z.array(statusEventSchema),
});
export const reviewedLoanDetailSchema = loanDetailSchema.extend({
  applicantSnapshot: z.strictObject({ ...personalFieldSchemas, email: z.email() }),
  eligibilityAtSubmission: eligibilityResultSchema, salarySlip: documentSchema,
});
export type LoanSummary = z.infer<typeof loanSummarySchema>;
export type LoanDetail = z.infer<typeof loanDetailSchema>;
export type ReviewedLoanDetail = z.infer<typeof reviewedLoanDetailSchema>;
export const loanDetailResponseSchema = z.strictObject({ data: loanDetailSchema });
export const reviewedLoanResponseSchema = z.strictObject({ data: reviewedLoanDetailSchema });
export const borrowerLoanListQuerySchema = z.strictObject({ ...paginationQueryFields, status: z.enum(['ALL', ...loanStatuses]).default('ALL') });
export type BorrowerLoanListQuery = z.infer<typeof borrowerLoanListQuerySchema>;
export const loanPageSchema = pageSchema(loanSummarySchema);
const executiveLoanQueryFields = { ...paginationQueryFields, q: z.string().trim().min(1).max(100).optional() };
export const sanctionLoanListQuerySchema = z.strictObject({ ...executiveLoanQueryFields, status: z.enum(['ALL', ...loanStatuses]).default('APPLIED') });
export const disbursementLoanListQuerySchema = z.strictObject({ ...executiveLoanQueryFields, status: z.enum(['ALL', 'SANCTIONED', 'DISBURSED', 'CLOSED']).default('SANCTIONED') });
export const collectionLoanListQuerySchema = z.strictObject({ ...executiveLoanQueryFields, status: z.enum(['ALL', 'DISBURSED', 'CLOSED']).default('DISBURSED') });
export type SanctionLoanListQuery = z.infer<typeof sanctionLoanListQuerySchema>;
export type DisbursementLoanListQuery = z.infer<typeof disbursementLoanListQuerySchema>;
export type CollectionLoanListQuery = z.infer<typeof collectionLoanListQuerySchema>;
export const sanctionLoanPageSchema = pageSchema(loanSummarySchema);
export const disbursementLoanPageSchema = pageSchema(loanSummarySchema);
export const collectionLoanPageSchema = pageSchema(loanSummarySchema);
export const sanctionDecisionSchema = z.discriminatedUnion('decision', [
  z.strictObject({ decision: z.literal('APPROVE') }),
  z.strictObject({ decision: z.literal('REJECT'), reason: z.string().trim().min(1, 'Provide a rejection reason.').max(1000) }),
]);
export type SanctionDecision = z.infer<typeof sanctionDecisionSchema>;

const utrSchema = z.string().trim().toUpperCase().min(1, 'Enter a UTR.').max(100).regex(/^[A-Z0-9-]+$/, 'Use only letters, numbers, and hyphens.');
const positivePaise = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
export const recordPaymentSchema = z.strictObject({ utr: utrSchema, amountPaise: positivePaise, paymentDate: dateOnlySchema });
export type RecordPayment = z.infer<typeof recordPaymentSchema>;
export const paymentSchema = z.strictObject({
  id: objectIdSchema, loanId: objectIdSchema, utr: utrSchema, amountPaise: positivePaise,
  paymentDate: dateOnlySchema, recordedBy: objectIdSchema, createdAt: z.iso.datetime(),
});
export type PaymentDTO = z.infer<typeof paymentSchema>;
export const paymentPageSchema = pageSchema(paymentSchema);
export const paymentListQuerySchema = z.strictObject({ ...paginationQueryFields });
export type PaymentListQuery = z.infer<typeof paymentListQuerySchema>;
export const recordPaymentResultSchema = z.strictObject({ payment: paymentSchema, loan: loanDetailSchema });
export type RecordPaymentResult = z.infer<typeof recordPaymentResultSchema>;
export const recordPaymentResponseSchema = z.strictObject({ data: recordPaymentResultSchema });
