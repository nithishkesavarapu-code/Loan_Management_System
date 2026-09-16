import { model, Schema } from 'mongoose';
import { reference, safeInteger } from '../../models/fields.js';
import { salarySlipMaxBytes, salarySlipMimeTypes } from '@lms/shared';

const documentSchema = new Schema({
  borrowerId: { ...reference('User'), immutable: true },
  applicationId: { ...reference('Application'), immutable: true },
  storageKey: { type: String, required: true, immutable: true },
  originalName: { type: String, required: true, maxlength: 255 },
  detectedMimeType: { type: String, enum: salarySlipMimeTypes, required: true },
  sizeBytes: { type: Number, min: 1, max: salarySlipMaxBytes, validate: safeInteger, required: true },
}, { timestamps: true, strict: 'throw', collection: 'documents' });
documentSchema.index({ storageKey: 1 }, { unique: true });
documentSchema.index({ applicationId: 1 });
export const Document = model('Document', documentSchema);
