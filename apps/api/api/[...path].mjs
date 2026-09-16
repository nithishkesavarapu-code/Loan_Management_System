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
    getApp()(req, res);
  } catch (error) {
    console.error('Vercel API Serverless Handler initialization error:', error);
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify({ error: { code: 'DEPENDENCY_UNAVAILABLE', message: 'The database is not ready.' } }));
  }
}
