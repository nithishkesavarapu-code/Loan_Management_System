import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseEnvironment } from '../src/config/env.js';

const valid = {
  WEB_ORIGIN: 'http://localhost:3000',
  MONGODB_URI: 'mongodb://127.0.0.1:27018/lms?replicaSet=lms-rs',
  JWT_SECRET: 'test-only-secret-with-at-least-32-characters',
};

test('environment validates and converts runtime settings', () => {
  const env = parseEnvironment({ ...valid, API_PORT: '4100', COOKIE_SECURE: 'false' });
  assert.equal(env.API_PORT, 4100);
  assert.equal(env.COOKIE_SECURE, false);
  assert.equal(env.JWT_TTL_SECONDS, 3600);
});

test('Atlas SRV configuration preserves credentials/options and requires a connection URI', () => {
  const uri = 'mongodb+srv://test-user:encoded%40password@cluster.example.test/lms?retryWrites=true&w=majority';
  const env = parseEnvironment({ ...valid, MONGODB_URI: uri, MONGODB_SERVER_SELECTION_TIMEOUT_MS: '10000' });
  assert.equal(env.MONGODB_URI, uri);
  assert.equal(env.MONGODB_SERVER_SELECTION_TIMEOUT_MS, 10000);
  assert.throws(() => parseEnvironment({ ...valid, MONGODB_URI: '' }), /MONGODB_URI/);
});

test('invalid configuration fails without echoing a database credential', () => {
  const secretUri = 'https://user:private-password@example.test';
  assert.throws(() => parseEnvironment({ ...valid, MONGODB_URI: secretUri }), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /MONGODB_URI/);
    assert.ok(!error.message.includes('private-password'));
    return true;
  });
});

test('unsafe ports, ambiguous origins, and placeholder secrets are rejected', () => {
  assert.throws(() => parseEnvironment({ ...valid, API_PORT: '0' }));
  assert.throws(() => parseEnvironment({ ...valid, WEB_ORIGIN: 'http://localhost:3000/path' }));
  assert.throws(() => parseEnvironment({ ...valid, JWT_SECRET: 'replace-with-a-random-secret' }));
});

test('production requires an HTTPS origin and secure cookies', () => {
  assert.throws(() => parseEnvironment({ ...valid, NODE_ENV: 'production' }));
  const env = parseEnvironment({ ...valid, NODE_ENV: 'production', WEB_ORIGIN: 'https://lms.example.test', COOKIE_SECURE: 'true' });
  assert.equal(env.COOKIE_SECURE, true);
});
