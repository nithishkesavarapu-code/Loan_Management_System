import { createApp } from './app.js';
import { parseEnvironment } from './config/env.js';
import { connectDatabase } from './config/database.js';
import { ensureIndexes } from './models/indexes.js';
import type { IncomingMessage, ServerResponse } from 'node:http';

let env: ReturnType<typeof parseEnvironment> | undefined;
let app: ReturnType<typeof createApp> | undefined;
let ready: Promise<void> | undefined;

function getApp() {
  if (!app) {
    env = parseEnvironment(process.env);
    app = createApp(env);
  }
  return app;
}

async function initialize() {
  getApp();
  if (!ready && env) {
    ready = connectDatabase(env).then(() => ensureIndexes());
  }
  try {
    await ready;
  } catch (error) {
    ready = undefined;
    throw error;
  }
}

export default async function handler(req: IncomingMessage & { originalUrl?: string }, res: ServerResponse) {
  try {
    await initialize();
    const appInstance = getApp();

    if (req.url === '/api/index.js' || req.url === '/api' || req.url?.startsWith('/api/index.js?') || req.url?.startsWith('/api?')) {
      const original = req.originalUrl || req.headers['x-matched-path'] || req.headers['x-forwarded-uri'];
      if (typeof original === 'string' && original.startsWith('/api')) {
        req.url = original;
      }
    }

    return await new Promise<void>((resolve, reject) => {
      res.on('finish', resolve);
      res.on('close', resolve);
      res.on('error', reject);
      appInstance(req, res, (err?: unknown) => {
        if (err) reject(err);
        else resolve();
      });
    });
  } catch (error) {
    console.error('Vercel API Serverless Handler error:', error);
    if (!res.headersSent) {
      res.statusCode = 503;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify({
        error: {
          code: 'INITIALIZATION_FAILED',
          message: error instanceof Error ? error.message : 'Server initialization failed'
        }
      }));
    }
  }
}
