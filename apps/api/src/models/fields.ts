import { Schema } from 'mongoose';
import { employmentModes, isDateOnly } from '@lms/shared';
export { isDateOnly } from '@lms/shared';

export const safeInteger = { validator: (value: number | null) => value === null || Number.isSafeInteger(value), message: 'Must be a safe integer.' };
export const money = { type: Number, min: 0, max: Number.MAX_SAFE_INTEGER, validate: safeInteger } as const;
export const reference = (ref: string) => ({ type: Schema.Types.ObjectId, ref, required: true } as const);
export const personalFields = {
  fullName: { type: String, trim: true, validate: {
    validator: (value: string | null) => value === null || (Array.from(value).length >= 2 && Array.from(value).length <= 120),
    message: 'Use 2-120 characters.',
  }, default: null },
  pan: { type: String, trim: true, uppercase: true, maxlength: 32, default: null },
  dob: { type: String, validate: { validator: (value: string | null) => value === null || isDateOnly(value), message: 'Invalid date.' }, default: null },
  monthlySalaryPaise: { ...money, default: null },
  employmentMode: { type: String, enum: [...employmentModes, null], default: null },
} as const;
export const eligibilitySchema = new Schema({
  eligible: { type: Boolean, required: true },
  evaluatedAt: { type: Date, required: true },
  ageYears: { type: Number, min: 0, validate: safeInteger, default: null },
  failures: { type: [new Schema({
    field: { type: String, enum: Object.keys(personalFields), required: true },
    code: { type: String, enum: ['REQUIRED', 'INVALID_FORMAT', 'PAN_INVALID', 'AGE_OUT_OF_RANGE', 'SALARY_TOO_LOW', 'EMPLOYMENT_INELIGIBLE'], required: true },
    message: { type: String, required: true },
  }, { _id: false, strict: 'throw' })], default: [] },
}, { _id: false, strict: 'throw' });
