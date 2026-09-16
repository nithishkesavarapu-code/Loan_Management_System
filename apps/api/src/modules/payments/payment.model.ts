import { model, Schema } from 'mongoose';
import { isDateOnly, money, reference } from '../../models/fields.js';

const paymentSchema = new Schema({
  loanId: { ...reference('Loan'), immutable: true },
  utrNormalized: { type: String, trim: true, uppercase: true, match: /^[A-Z0-9-]+$/, maxlength: 100, required: true, immutable: true },
  amountPaise: { ...money, min: 1, required: true, immutable: true },
  paymentDate: { type: String, validate: isDateOnly, required: true, immutable: true },
  recordedBy: { ...reference('User'), immutable: true },
}, { timestamps: true, strict: 'throw', collection: 'payments' });
paymentSchema.index({ utrNormalized: 1 }, { unique: true });
paymentSchema.index({ loanId: 1, paymentDate: -1, createdAt: -1 });
export const Payment = model('Payment', paymentSchema);
