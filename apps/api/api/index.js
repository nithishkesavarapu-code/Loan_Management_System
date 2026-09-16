import { createApp } from '../dist/app.js';
import { parseEnvironment } from '../dist/config/env.js';
import { connectDatabase } from '../dist/config/database.js';
import { ensureIndexes } from '../dist/models/indexes.js';

let env;
let app;
let ready;

function getApp() {
  if (!app) {
    env = parseEnvironment(process.env);
    app = createApp(env);
  }
  return app;
}

async function initialize() {
  getApp();
  if (!ready) ready = connectDatabase(env).then(() => ensureIndexes());
  try {
    await ready;
  } catch (error) {
    ready = undefined;
    throw error;
  }
}

export default async function handler(req, res) {
  try {
    await initialize();
    const appInstance = getApp();

    // If Vercel rewrite changed req.url to /api/index.js or /api, restore original URL
    if (req.url === '/api/index.js' || req.url === '/api' || req.url.startsWith('/api/index.js?') || req.url.startsWith('/api?')) {
      const original = req.originalUrl || req.headers['x-matched-path'] || req.headers['x-forwarded-uri'];
      if (typeof original === 'string' && original.startsWith('/api')) {
        req.url = original;
      }
    }

    return await new Promise((resolve, reject) => {
      res.on('finish', resolve);
      res.on('close', resolve);
      res.on('error', reject);
      appInstance(req, res, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  } catch (error) {
    console.error('Vercel API Serverless Handler initialization error:', error);
    if (!res.headersSent) {
      res.statusCode = 503;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify({
        error: {
          code: 'DEPENDENCY_UNAVAILABLE',
          message: error instanceof Error ? error.message : 'The database or environment is not ready.'
        }
      }));
    }
  }
}
