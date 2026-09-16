import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { parseEnvironment } from '../config/env.js';
import { connectDatabase, disconnectDatabase } from '../config/database.js';

async function check(): Promise<void> {
  await connectDatabase(parseEnvironment(process.env));
  const db = mongoose.connection.db;
  if (!db) throw new Error('Database connection is unavailable.');
  const checks = db.collection<{ runId: string; kind: string }>('_connection_checks');
  const runId = randomUUID();
  const session = await mongoose.startSession();
  try {
    await checks.insertOne({ runId, kind: 'baseline' });
    await session.withTransaction(async () => {
      await checks.insertOne({ runId, kind: 'committed' }, { session });
    });
    assert.equal(await checks.countDocuments({ runId, kind: 'committed' }), 1);

    const rollback = new Error('Intentional rollback check');
    await assert.rejects(session.withTransaction(async () => {
      await checks.insertOne({ runId, kind: 'rolled-back' }, { session });
      throw rollback;
    }), (error: unknown) => error === rollback);
    assert.equal(await checks.countDocuments({ runId, kind: 'rolled-back' }), 0);
    console.log('PASS: database connection, writable replica set, transaction commit, and transaction rollback.');
  } finally {
    await session.endSession();
    await checks.deleteMany({ runId });
  }
}

try {
  await check();
} catch {
  console.error('Database verification failed. Check the configured replica set and permissions.');
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
