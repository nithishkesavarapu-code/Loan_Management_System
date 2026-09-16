import assert from 'node:assert/strict';
import { test } from 'node:test';
import request from 'supertest';
import { healthResponseSchema } from '@lms/shared';
import { createApp } from '../src/app.js';
import { mutationHeaders, testEnv } from './fixtures.js';

test('health confirms the database and returns the shared contract without caching', async () => {
  let checked = false;
  const app = createApp(testEnv, async () => { checked = true; });
  const response = await request(app).get('/api/v1/health').expect(200);
  assert.equal(checked, true);
  assert.equal(healthResponseSchema.parse(response.body).data.database, 'connected');
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.headers['x-powered-by'], undefined);
});

test('database failure returns 503 without leaking a connection error', async () => {
  const app = createApp(testEnv, async () => { throw new Error('mongodb://secret-user:secret-password@private-host'); });
  const response = await request(app).get('/api/v1/health').expect(503);
  assert.deepEqual(response.body, { error: { code: 'DEPENDENCY_UNAVAILABLE', message: 'The database is not ready.' } });
});

test('health rejects undocumented query parameters', async () => {
  const app = createApp(testEnv, async () => {});
  const response = await request(app).get('/api/v1/health?debug=true').expect(422);
  assert.equal(response.body.error.code, 'VALIDATION_FAILED');
});

test('unknown routes use the standard 404 envelope', async () => {
  const response = await request(createApp(testEnv)).get('/api/v1/unknown').expect(404);
  assert.deepEqual(response.body, { error: { code: 'NOT_FOUND', message: 'The requested resource was not found.' } });
});

test('malformed JSON is translated to a 400 response', async () => {
  const response = await request(createApp(testEnv)).post('/api/v1/unknown').set(mutationHeaders).set('Content-Type', 'application/json').send('{').expect(400);
  assert.equal(response.body.error.code, 'MALFORMED_REQUEST');
});

test('every mutation requires both the exact Origin and the custom header', async () => {
  const app = createApp(testEnv);
  for (const path of ['/auth/register', '/auth/login', '/auth/logout', '/borrower/applications', '/sanction/loans/example/decision']) {
    for (const headers of [{}, { Origin: testEnv.WEB_ORIGIN }, { 'X-LMS-Request': '1' }, { ...mutationHeaders, Origin: 'https://attacker.example' }, { ...mutationHeaders, Origin: 'null' }]) {
      const response = await request(app).post(`/api/v1${path}`).set(headers).send({}).expect(403);
      assert.equal(response.body.error.code, 'CSRF_REJECTED');
    }
  }
});

test('anonymous protected reads and mutations fail before JSON parsing', async () => {
  const app = createApp(testEnv);
  for (const path of ['/auth/me', '/borrower/applications', '/sales/leads', '/sanction/loans', '/disbursement/loans', '/collection/loans', '/documents/example']) {
    await request(app).get(`/api/v1${path}`).expect(401);
  }
  await request(app).post('/api/v1/borrower/applications').set(mutationHeaders).set('Content-Type', 'application/json').send('{').expect(401);
});

test('signup refuses role injection, malformed input, unsupported content and oversized bodies', async () => {
  const app = createApp(testEnv);
  for (const extra of [{ role: 'ADMIN' }, { userId: 'a'.repeat(24) }, { passwordHash: 'fake' }]) {
    await request(app).post('/api/v1/auth/register').set(mutationHeaders).send({ email: 'valid@example.test', password: 'ValidPassword!12', ...extra }).expect(422);
  }
  await request(app).post('/api/v1/auth/login').set(mutationHeaders).type('form').send({ email: 'valid@example.test', password: 'ValidPassword!12' }).expect(415);
  await request(app).post('/api/v1/auth/login').set(mutationHeaders).set('Content-Type', 'application/json').send('{').expect(400);
  await request(app).post('/api/v1/auth/login').set(mutationHeaders).send({ email: 'a'.repeat(110000) }).expect(413);
});
