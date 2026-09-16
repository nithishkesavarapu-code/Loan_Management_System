import { parseEnvironment } from '../src/config/env.js';

export const testEnv = parseEnvironment({
  NODE_ENV: 'test', WEB_ORIGIN: 'http://localhost:3000', MONGODB_URI: 'mongodb://127.0.0.1:27018/lms_test',
  JWT_SECRET: 'synthetic-unit-test-secret-not-for-running-apps',
});
export const mutationHeaders = { Origin: testEnv.WEB_ORIGIN, 'X-LMS-Request': '1' };
