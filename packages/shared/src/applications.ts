import { z } from 'zod';
import { applicationStates, employmentModes } from './constants.js';
import { indiaDate, isDateOnly } from './dates.js';

export const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i);
export const dateOnlySchema = z.string().refine(isDateOnly, 'Enter a real date in YYYY-MM-DD format.');
export const personalFieldNames = ['fullName', 'pan', 'dob', 'monthlySalaryPaise', 'employmentMode'] as const;
export type PersonalField = (typeof personalFieldNames)[number];
export const personalFieldLabels: Record<PersonalField, string> = {
  fullName: 'Full name', pan: 'PAN', dob: 'Date of birth', monthlySalaryPaise: 'Monthly salary', employmentMode: 'Employment mode',
};
export const personalFieldSchemas = {
  fullName: z.string().trim().refine((value) => Array.from(value).length >= 2 && Array.from(value).length <= 120, 'Use 2-120 characters.'),
  pan: z.string().trim().toUpperCase().max(32, 'Use at most 32 characters.'),
  dob: dateOnlySchema,
  monthlySalaryPaise: z.number().int().nonnegative(),
  employmentMode: z.enum(employmentModes),
};
export const personalDetailsDraftSchema = z.strictObject({
  fullName: personalFieldSchemas.fullName.nullable(), pan: personalFieldSchemas.pan.nullable(),
  dob: personalFieldSchemas.dob.nullable(), monthlySalaryPaise: personalFieldSchemas.monthlySalaryPaise.nullable(),
  employmentMode: personalFieldSchemas.employmentMode.nullable(),
});
export type PersonalDetailsDraft = z.infer<typeof personalDetailsDraftSchema>;
export type PersonalDetails = { [K in keyof PersonalDetailsDraft]: NonNullable<PersonalDetailsDraft[K]> };
export const eligibilityResultSchema = z.strictObject({
  eligible: z.boolean(), evaluatedAt: z.iso.datetime(), ageYears: z.number().int().nonnegative().nullable(),
  failures: z.array(z.strictObject({
    field: z.enum(personalFieldNames),
    code: z.enum(['REQUIRED', 'INVALID_FORMAT', 'PAN_INVALID', 'AGE_OUT_OF_RANGE', 'SALARY_TOO_LOW', 'EMPLOYMENT_INELIGIBLE']),
    message: z.string(),
  })),
});
export type EligibilityResult = z.infer<typeof eligibilityResultSchema>;
export const applicationSteps = ['PERSONAL_DETAILS', 'SALARY_SLIP', 'LOAN_CONFIGURATION', 'SUBMITTED'] as const;
export type ApplicationStep = (typeof applicationSteps)[number];
export const applicationStepLabels: Record<ApplicationStep, string> = {
  PERSONAL_DETAILS: 'Personal details', SALARY_SLIP: 'Salary slip', LOAN_CONFIGURATION: 'Loan configuration', SUBMITTED: 'Submitted',
};
export const employmentLabels = { SALARIED: 'Salaried', SELF_EMPLOYED: 'Self-employed', UNEMPLOYED: 'Unemployed' } as const;
export const loanLimits = { minPrincipalPaise: 5_000_000, maxPrincipalPaise: 50_000_000, minTenureDays: 30, maxTenureDays: 365, annualRatePercent: 12 } as const;
export const loanConfigurationSchema = z.strictObject({
  principalPaise: z.number().int().min(loanLimits.minPrincipalPaise).max(loanLimits.maxPrincipalPaise),
  tenureDays: z.number().int().min(loanLimits.minTenureDays).max(loanLimits.maxTenureDays),
});
export type LoanConfiguration = z.infer<typeof loanConfigurationSchema>;
export function updateApplicationSchema(now: Date) {
  const personal = personalDetailsDraftSchema.extend({
    dob: dateOnlySchema.refine((value) => value <= indiaDate(now), 'Date of birth cannot be in the future.').nullable(),
  }).partial();
  return z.strictObject({ personalDetails: personal.optional(), loanConfig: loanConfigurationSchema.partial().optional() })
    .refine((value) => Object.keys(value.personalDetails ?? {}).length + Object.keys(value.loanConfig ?? {}).length > 0, 'Provide at least one field to update.');
}
export type UpdateApplicationRequest = z.infer<ReturnType<typeof updateApplicationSchema>>;
export const salarySlipMaxBytes = 5_000_000;
export const salarySlipMimeTypes = ['application/pdf', 'image/jpeg', 'image/png'] as const;
export const salarySlipExtensions: Record<(typeof salarySlipMimeTypes)[number], readonly string[]> = {
  'application/pdf': ['.pdf'], 'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'],
};
export const documentSchema = z.strictObject({
  id: objectIdSchema, originalName: z.string(), mimeType: z.enum(['application/pdf', 'image/jpeg', 'image/png']),
  sizeBytes: z.number().int().min(1).max(salarySlipMaxBytes), createdAt: z.iso.datetime(),
});
export type DocumentDTO = z.infer<typeof documentSchema>;
export const documentResponseSchema = z.strictObject({ data: documentSchema });
export const applicationSchema = z.strictObject({
  id: objectIdSchema, borrowerId: objectIdSchema, state: z.enum(applicationStates),
  personalDetails: personalDetailsDraftSchema, loanConfig: loanConfigurationSchema,
  salarySlip: documentSchema.nullable(), eligibility: eligibilityResultSchema,
  nextStep: z.enum(applicationSteps), loanId: objectIdSchema.nullable(), submittedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
});
export type ApplicationDTO = z.infer<typeof applicationSchema>;
export const applicationResponseSchema = z.strictObject({ data: applicationSchema });
export const eligibilityResponseSchema = z.strictObject({ data: eligibilityResultSchema });
export function applicationNextStep(eligible: boolean, hasSlip: boolean, state: 'DRAFT' | 'SUBMITTED'): ApplicationStep {
  if (state === 'SUBMITTED') return 'SUBMITTED';
  return !eligible ? 'PERSONAL_DETAILS' : hasSlip ? 'LOAN_CONFIGURATION' : 'SALARY_SLIP';
}
