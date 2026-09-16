import mongoose from 'mongoose';
import type { Environment } from './env.js';

mongoose.set('bufferCommands', false);

export async function connectDatabase(env: Environment): Promise<void> {
  await mongoose.connect(env.MONGODB_URI, {
    serverSelectionTimeoutMS: env.MONGODB_SERVER_SELECTION_TIMEOUT_MS,
    connectTimeoutMS: env.MONGODB_SERVER_SELECTION_TIMEOUT_MS,
    maxPoolSize: 10,
    autoIndex: env.NODE_ENV !== 'production',
  });
  await assertDatabaseReady();
}

export async function assertDatabaseReady(): Promise<void> {
  const db = mongoose.connection.db;
  if (mongoose.connection.readyState !== 1 || !db) throw new Error('Database is disconnected.');
  const topology = await db.admin().command({ hello: 1 }, { timeoutMS: 2000 });
  const supportsTransactions = typeof topology.setName === 'string' || topology.msg === 'isdbgrid';
  if (!supportsTransactions || topology.logicalSessionTimeoutMinutes == null || !topology.isWritablePrimary) {
    throw new Error('A writable MongoDB replica set or sharded cluster is required.');
  }
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}
