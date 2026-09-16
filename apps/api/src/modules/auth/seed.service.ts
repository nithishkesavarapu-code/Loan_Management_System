import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import { User } from './user.model.js';
import { PASSWORD_COST } from './auth.service.js';
import { DEMO_PASSWORD, seedAccounts } from './seed-accounts.js';

export async function seedUsers(): Promise<void> {
  await mongoose.connection.transaction(async (session) => {
    for (const account of seedAccounts) {
      const existing = await User.findOne({ $or: [{ email: account.email }, { seedKey: account.seedKey }] })
        .select('+seedKey').session(session);
      if (existing) {
        if (existing.email !== account.email || existing.seedKey !== account.seedKey || existing.role !== account.role) {
          throw new Error(`Seed collision for ${account.email}; no accounts were changed.`);
        }
        continue;
      }
      await User.create([{ ...account, passwordHash: await bcrypt.hash(DEMO_PASSWORD, PASSWORD_COST) }], { session });
    }
  });
}
