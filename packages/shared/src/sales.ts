import { z } from 'zod';
import { employmentModes } from './constants.js';
import { eligibilityResultSchema, objectIdSchema } from './applications.js';
import { pageSchema } from './pagination.js';

export const leadSummarySchema = z.strictObject({
  borrowerId: objectIdSchema, email: z.email(), fullName: z.string().nullable(), registeredAt: z.iso.datetime(),
  draftId: objectIdSchema.nullable(), nextStep: z.enum(['PERSONAL_DETAILS', 'SALARY_SLIP', 'LOAN_CONFIGURATION']),
  eligible: z.boolean().nullable(),
});
export const leadDetailSchema = leadSummarySchema.extend({
  employmentMode: z.enum(employmentModes).nullable(), eligibility: eligibilityResultSchema.nullable(), draftUpdatedAt: z.iso.datetime().nullable(),
});
export type LeadSummary = z.infer<typeof leadSummarySchema>;
export type LeadDetail = z.infer<typeof leadDetailSchema>;
export const leadPageSchema = pageSchema(leadSummarySchema);
export const leadResponseSchema = z.strictObject({ data: leadDetailSchema });
