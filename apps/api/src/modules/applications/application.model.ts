import { model, Schema, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { applicationStates } from '@lms/shared';
import { eligibilitySchema, personalFields, reference, safeInteger } from '../../models/fields.js';

const applicationSchema = new Schema({
  borrowerId: { ...reference('User'), immutable: true },
  personalDetails: { type: new Schema(personalFields, { _id: false, strict: 'throw' }), default: () => ({}) },
  principalPaise: { type: Number, min: 5_000_000, max: 50_000_000, validate: safeInteger, required: true, default: 5_000_000 },
  tenureDays: { type: Number, min: 30, max: 365, validate: safeInteger, required: true, default: 30 },
  salarySlipId: { type: Schema.Types.ObjectId, ref: 'Document', default: null },
  state: { type: String, enum: applicationStates, required: true, default: 'DRAFT' },
  eligibilityAtSubmission: { type: eligibilitySchema, default: null },
  submittedAt: { type: Date, default: null },
}, { timestamps: true, strict: 'throw', collection: 'applications' });
applicationSchema.index({ borrowerId: 1 }, { unique: true, partialFilterExpression: { state: 'DRAFT' }, name: 'one_draft_per_borrower' });
applicationSchema.index({ borrowerId: 1, createdAt: -1 });
export const Application = model('Application', applicationSchema);
export type ApplicationRecord = InferSchemaType<typeof applicationSchema>;
export type ApplicationDocument = HydratedDocument<ApplicationRecord>;
