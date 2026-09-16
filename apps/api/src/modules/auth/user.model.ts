import { model, Schema, type InferSchemaType } from 'mongoose';
import { emailSchema, roles } from '@lms/shared';

const userSchema = new Schema({
  email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254,
    validate: (value: string) => emailSchema.safeParse(value).success },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: roles, required: true, default: 'BORROWER' },
  seedKey: { type: String, select: false, immutable: true },
}, { timestamps: true, strict: 'throw', collection: 'users' });
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ seedKey: 1 }, { unique: true, sparse: true });
export type UserRecord = InferSchemaType<typeof userSchema>;
export const User = model('User', userSchema);
