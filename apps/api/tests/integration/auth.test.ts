import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import bcrypt from 'bcrypt';
import mongoose, { Types } from 'mongoose';
import request from 'supertest';
import { authResponseSchema, canAccessModule, dashboardModules, SESSION_COOKIE } from '@lms/shared';
import { createApp } from '../../src/app.js';
import { parseEnvironment } from '../../src/config/env.js';
import { connectDatabase, disconnectDatabase } from '../../src/config/database.js';
import { ensureIndexes } from '../../src/models/indexes.js';
import { User } from '../../src/modules/auth/user.model.js';
import { Application } from '../../src/modules/applications/application.model.js';
import { Document } from '../../src/modules/documents/document.model.js';
import { Loan } from '../../src/modules/loans/loan.model.js';
import { Payment } from '../../src/modules/payments/payment.model.js';
import { createSession } from '../../src/modules/auth/session.js';
import { seedUsers } from '../../src/modules/auth/seed.service.js';
import { DEMO_PASSWORD, seedAccounts } from '../../src/modules/auth/seed-accounts.js';
import { ownedApplication, ownedDocument, ownedLoan } from '../../src/middleware/ownership.js';
import { HttpError } from '../../src/middleware/errors.js';

const dbName = `lms_step3_test_${randomUUID().replaceAll('-', '')}`;
const uri = new URL(process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27018/?replicaSet=lms-rs&directConnection=true');
uri.pathname = `/${dbName}`;
const env = parseEnvironment({ ...process.env, NODE_ENV: 'test', MONGODB_URI: uri.toString(), JWT_SECRET: 'isolated-integration-test-secret-not-the-app-secret' });
const headers = { Origin: env.WEB_ORIGIN, 'X-LMS-Request': '1' };
const app = createApp(env);
before(async () => { await connectDatabase(env); await ensureIndexes(); await seedUsers(); });
after(async () => {
  try {
    assert.match(dbName, /^lms_step3_test_[a-f0-9]{32}$/);
    if (mongoose.connection.readyState === 1) {
      assert.equal(mongoose.connection.name, dbName);
      await mongoose.connection.dropDatabase();
    }
  } finally { await disconnectDatabase(); }
});
function cookie(response: request.Response): string {
  const cookies = response.headers['set-cookie'] as unknown as string[];
  assert.ok(cookies?.[0]); return cookies[0].split(';')[0]!;
}
const duplicate = (error: unknown) => typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
const denied = (status: number) => (error: unknown) => error instanceof HttpError && error.status === status;

test('registration hashes passwords, normalizes email, creates only BORROWER and establishes a cookie session', async () => {
  const response = await request(app).post('/api/v1/auth/register').set(headers).send({ email: ' New.Borrower@Example.TEST ', password: '  Keep spaces!  ' }).expect(201);
  const user = authResponseSchema.parse(response.body).data;
  assert.equal(user.email, 'new.borrower@example.test'); assert.equal(user.role, 'BORROWER');
  const raw = await User.findById(user.id).select('+passwordHash').orFail();
  assert.equal(bcrypt.getRounds(raw.passwordHash), 12);
  assert.ok(await bcrypt.compare('  Keep spaces!  ', raw.passwordHash));
  assert.equal(await bcrypt.compare('Keep spaces!', raw.passwordHash), false);
  assert.equal((await User.findById(user.id).lean())?.passwordHash, undefined);
  const setCookie = String(response.headers['set-cookie']);
  for (const flag of ['HttpOnly', 'SameSite=Lax', 'Path=/', 'Max-Age=3600']) assert.ok(setCookie.includes(flag));
  assert.equal(setCookie.includes('Domain='), false);
  const me = await request(app).get('/api/v1/auth/me').set('Cookie', cookie(response)).expect(200);
  assert.deepEqual(me.body, response.body);
});

test('concurrent normalized duplicate registrations yield exactly one success', async () => {
  const first = request(app).post('/api/v1/auth/register').set(headers).send({ email: 'RACE@example.test', password: DEMO_PASSWORD });
  const second = request(app).post('/api/v1/auth/register').set(headers).send({ email: ' race@EXAMPLE.test ', password: DEMO_PASSWORD });
  const results = await Promise.all([first, second]);
  assert.deepEqual(results.map((result) => result.status).sort(), [201, 409]);
  assert.equal(results.find((result) => result.status === 409)?.body.error.code, 'EMAIL_ALREADY_EXISTS');
  assert.equal(await User.countDocuments({ email: 'race@example.test' }), 1);
});

test('all six seed accounts authenticate and obey the complete API module role matrix', async () => {
  for (const account of seedAccounts) {
    const response = await request(app).post('/api/v1/auth/login').set(headers).send({ email: account.email, password: DEMO_PASSWORD }).expect(200);
    assert.equal(authResponseSchema.parse(response.body).data.role, account.role);
    const session = cookie(response);
    for (const module of dashboardModules) {
      const authorized = canAccessModule(account.role, module);
      const listExpected = authorized && ['sanction', 'disbursement', 'collection'].includes(module) ? 200 : authorized ? 404 : 403;
      await request(app).get(`/api/v1/${module}/loans`).set('Cookie', session).expect(listExpected);
      await request(app).post(`/api/v1/${module}/loans/example/action`).set(headers).set('Cookie', session).send({}).expect(authorized ? 404 : 403);
    }
    await request(app).get('/api/v1/borrower/applications').set('Cookie', session).expect(account.role === 'BORROWER' ? 200 : 403);
    await request(app).get('/api/v1/documents/000000000000000000000000').set('Cookie', session).expect(['BORROWER', 'ADMIN', 'SANCTION'].includes(account.role) ? 404 : 403);
  }
});

test('invalid login responses are indistinguishable and logout removes the cookie', async () => {
  const unknown = await request(app).post('/api/v1/auth/login').set(headers).send({ email: 'missing@example.test', password: DEMO_PASSWORD }).expect(401);
  const wrong = await request(app).post('/api/v1/auth/login').set(headers).send({ email: seedAccounts[0]!.email, password: 'WrongPassword!12' }).expect(401);
  assert.deepEqual(unknown.body, wrong.body);
  const agent = request.agent(app);
  await agent.post('/api/v1/auth/login').set(headers).send({ email: seedAccounts[0]!.email, password: DEMO_PASSWORD }).expect(200);
  const response = await agent.post('/api/v1/auth/logout').set(headers).expect(204);
  assert.equal(response.text, '');
  assert.match(String(response.headers['set-cookie']), /lms_session=;.*Expires=Thu, 01 Jan 1970/);
  await agent.get('/api/v1/auth/me').expect(401);
  await agent.post('/api/v1/auth/logout').set(headers).expect(401);
});

test('current database roles take effect immediately and deleted users lose access', async () => {
  const user = await User.create({ email: 'changing@example.test', passwordHash: 'not-used-for-login', role: 'SALES' });
  const session = `${SESSION_COOKIE}=${await createSession(user.id, env)}`;
  await request(app).get('/api/v1/sales/leads').set('Cookie', session).expect(200);
  await User.updateOne({ _id: user._id }, { $set: { role: 'COLLECTION' } });
  await request(app).get('/api/v1/sales/leads').set('Cookie', session).expect(403);
  const me = await request(app).get('/api/v1/auth/me').set('Cookie', session).expect(200);
  assert.equal(me.body.data.role, 'COLLECTION');
  await User.deleteOne({ _id: user._id });
  await request(app).get('/api/v1/auth/me').set('Cookie', session).expect(401);
});

test('real indexes enforce one draft, one loan per application, and globally unique normalized UTRs', async () => {
  const borrowerId = new Types.ObjectId();
  const application = await Application.create({ borrowerId });
  await assert.rejects(Application.create({ borrowerId }), duplicate);
  await Application.updateOne({ _id: application._id }, { $set: { state: 'SUBMITTED' } });
  await Application.create({ borrowerId });
  const loanInput = {
    borrowerId, applicationId: application._id, salarySlipId: new Types.ObjectId(),
    applicantSnapshot: { fullName: 'Synthetic Borrower', email: 'synthetic@example.test', pan: 'ABCDE1234F', dob: '1995-06-15', monthlySalaryPaise: 5_000_000, employmentMode: 'SALARIED' as const },
    eligibilityAtSubmission: { eligible: true, evaluatedAt: new Date(), ageYears: 31, failures: [] },
    principalPaise: 5_000_000, tenureDays: 365, interestPaise: 600_000, totalRepaymentPaise: 5_600_000,
    statusHistory: [{ fromStatus: null, toStatus: 'APPLIED' as const, actorId: borrowerId, actorRole: 'BORROWER' as const, occurredAt: new Date() }],
  };
  const loan = await Loan.create(loanInput);
  await assert.rejects(Loan.create(loanInput), duplicate);
  const paymentInput = { loanId: loan._id, recordedBy: new Types.ObjectId(), utrNormalized: ' duplicate-utr ', amountPaise: 100, paymentDate: '2026-09-15' };
  await Payment.create(paymentInput);
  await assert.rejects(Payment.create({ ...paymentInput, loanId: new Types.ObjectId(), utrNormalized: 'DUPLICATE-UTR' }), duplicate);
  const document = await Document.create({ borrowerId, applicationId: application._id, storageKey: 'synthetic-test.pdf', originalName: 'test.pdf', detectedMimeType: 'application/pdf', sizeBytes: 100 });
  for (const [lookup, id] of [[ownedApplication, application.id], [ownedLoan, loan.id], [ownedDocument, document.id]] as const) {
    assert.equal((await lookup(id, borrowerId.toHexString())).id, id);
    await assert.rejects(lookup(id, new Types.ObjectId().toHexString()), denied(404));
    await assert.rejects(lookup(new Types.ObjectId().toHexString(), borrowerId.toHexString()), denied(404));
    await assert.rejects(lookup('invalid', borrowerId.toHexString()), denied(400));
  }
  const collections = await mongoose.connection.db!.listCollections({}, { nameOnly: true }).toArray();
  assert.deepEqual(collections.map((collection) => collection.name).sort(), ['applications', 'documents', 'loans', 'payments', 'users']);
});

test('seed reruns preserve accounts and collisions roll back without promotion or unrelated deletion', async () => {
  const snapshot = await User.find({ seedKey: { $exists: true } }).select('+passwordHash +seedKey').sort({ email: 1 }).lean();
  await seedUsers();
  assert.deepEqual(await User.find({ seedKey: { $exists: true } }).select('+passwordHash +seedKey').sort({ email: 1 }).lean(), snapshot);
  const first = seedAccounts[0]!;
  const last = seedAccounts.at(-1)!;
  await User.deleteOne({ seedKey: first.seedKey });
  await User.deleteOne({ seedKey: last.seedKey });
  const unrelated = await User.create({ email: last.email, passwordHash: 'preserve-this-value', role: 'SALES' });
  await assert.rejects(seedUsers(), /Seed collision/);
  assert.equal(await User.countDocuments({ email: first.email }), 0, 'Earlier seed inserts must roll back on a later collision');
  const preserved = await User.findById(unrelated._id).select('+passwordHash +seedKey').orFail();
  assert.equal(preserved.role, 'SALES'); assert.equal(preserved.passwordHash, 'preserve-this-value'); assert.equal(preserved.seedKey, undefined);
  assert.equal(await User.countDocuments({ email: 'new.borrower@example.test' }), 1);
});
