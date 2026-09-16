import { parseEnvironment } from '../config/env.js';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { ensureIndexes } from '../models/indexes.js';
import { seedUsers } from '../modules/auth/seed.service.js';
import { seedAccounts } from '../modules/auth/seed-accounts.js';

async function main(): Promise<void> {
  const env = parseEnvironment(process.env);
  if (env.NODE_ENV === 'production') throw new Error('Development seed is disabled in production.');
  await connectDatabase(env);
  await ensureIndexes();
  await seedUsers();
  console.log('Six development accounts are ready (password documented in README.md).');
  for (const account of seedAccounts) console.log(`${account.role}: ${account.email}`);
}
main().catch((error: unknown) => {
  console.error(error instanceof Error && /^(Seed collision|Development seed)/.test(error.message)
    ? error.message : 'Seed failed. Check the database, indexes, and environment configuration.');
  process.exitCode = 1;
}).finally(disconnectDatabase);
