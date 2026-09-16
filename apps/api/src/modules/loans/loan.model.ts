import { model, Schema, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { loanStatuses, roles } from '@lms/shared';
import { eligibilitySchema, money, personalFields, reference, safeInteger } from '../../models/fields.js';

const applicantSchema = new Schema({
  fullName: { ...personalFields.fullName, required: true },
  pan: { ...personalFields.pan, required: true, match: /^[A-Z]{5}[0-9]{4}[A-Z]$/ },
  dob: { ...personalFields.dob, required: true },
  monthlySalaryPaise: { ...money, required: true },
  employmentMode: { ...personalFields.employmentMode, required: true },
  email: { type: String, required: true, trim: true, lowercase: true },
}, { _id: false, strict: 'throw' });
const statusEventSchema = new Schema({
  fromStatus: { type: String, enum: [...loanStatuses, null], default: null },
  toStatus: { type: String, enum: loanStatuses, required: true },
  actorId: reference('User'), actorRole: { type: String, enum: roles, required: true },
  occurredAt: { type: Date, required: true }, reason: { type: String, default: null },
}, { _id: false, strict: 'throw' });
const loanSchema = new Schema({
  borrowerId: { ...reference('User'), immutable: true },
  applicationId: { ...reference('Application'), immutable: true },
  applicantSnapshot: { type: applicantSchema, required: true, immutable: true },
  eligibilityAtSubmission: { type: eligibilitySchema, required: true, immutable: true },
  salarySlipId: { ...reference('Document'), immutable: true },
  principalPaise: { ...money, min: 5_000_000, max: 50_000_000, required: true, immutable: true },
  annualRatePercent: { type: Number, enum: [12], required: true, default: 12, immutable: true },
  tenureDays: { type: Number, min: 30, max: 365, validate: safeInteger, required: true, immutable: true },
  interestPaise: { ...money, required: true, immutable: true },
  totalRepaymentPaise: { ...money, required: true, immutable: true },
  totalPaidPaise: { ...money, required: true, default: 0 },
  status: { type: String, enum: loanStatuses, required: true, default: 'APPLIED' },
  rejectionReason: { type: String, default: null },
  sanctionedAt: { type: Date, default: null }, disbursedAt: { type: Date, default: null }, closedAt: { type: Date, default: null },
  statusHistory: { type: [statusEventSchema], required: true },
}, { timestamps: true, strict: 'throw', collection: 'loans' });
loanSchema.index({ applicationId: 1 }, { unique: true });
loanSchema.index({ status: 1, createdAt: -1 });
loanSchema.index({ borrowerId: 1, createdAt: -1 });
export const Loan = model('Loan', loanSchema);
export type LoanDocument = HydratedDocument<InferSchemaType<typeof loanSchema>>;
