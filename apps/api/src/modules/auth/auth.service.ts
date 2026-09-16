import bcrypt from 'bcrypt';
import type { Types } from 'mongoose';
import type { AuthRequest, UserDTO } from '@lms/shared';
import { User, type UserRecord } from './user.model.js';
import { HttpError } from '../../middleware/errors.js';

export const PASSWORD_COST = 12;
const DUMMY_HASH = '$2b$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW';
export function toUserDTO(user: UserRecord & { _id: Types.ObjectId }): UserDTO {
  return { id: user._id.toHexString(), email: user.email, role: user.role, createdAt: user.createdAt.toISOString() };
}
export async function register(input: AuthRequest): Promise<UserDTO> {
  const passwordHash = await bcrypt.hash(input.password, PASSWORD_COST);
  try {
    const user = await User.create({ email: input.email, passwordHash, role: 'BORROWER' });
    return toUserDTO(user);
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
      throw new HttpError(409, 'EMAIL_ALREADY_EXISTS', 'An account with this email already exists.');
    }
    throw error;
  }
}
export async function login(input: AuthRequest): Promise<UserDTO> {
  const user = await User.findOne({ email: input.email }).select('+passwordHash');
  const matches = await bcrypt.compare(input.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !matches) throw new HttpError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
  return toUserDTO(user);
}
