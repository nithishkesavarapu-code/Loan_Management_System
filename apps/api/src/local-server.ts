import { createServer } from 'node:http';
import { createApp } from './app.js';
import { parseEnvironment } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { ensureIndexes } from './models/indexes.js';

async function main(): Promise<void> {
  const env = parseEnvironment(process.env);
  await connectDatabase(env);
  await ensureIndexes();
  const server = createServer(createApp(env));

  let closing = false;
  const shutdown = () => {
    if (closing) return;
    closing = true;
    const timeout = setTimeout(() => process.exit(1), 10000);
    timeout.unref();
    server.close(() => {
      void disconnectDatabase().finally(() => {
        clearTimeout(timeout);
        process.exit(0);
      });
    });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(env.API_PORT, env.API_HOST, resolve);
  });
  console.log(`LMS API ready at http://${env.API_HOST}:${env.API_PORT}`);
}

main().catch(async (error: unknown) => {
  const message = error instanceof Error && error.message.startsWith('Invalid environment configuration:')
    ? error.message
    : 'API startup failed. Check the database replica set, API port and private UPLOAD_DIR configuration.';
  console.error(message);
  await disconnectDatabase();
  process.exitCode = 1;
});
