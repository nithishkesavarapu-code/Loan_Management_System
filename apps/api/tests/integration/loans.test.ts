import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir, rmdir, writeFile } from 'node:fs/promises';
import { before, after, test, mock } from 'node:test';
import mongoose, { Types } from 'mongoose';
import request from 'supertest';
import { loanPageSchema, reviewedLoanResponseSchema, type Role } from '@lms/shared';
import { createApp } from '../../src/app.js';
import { connectDatabase, disconnectDatabase } from '../../src/config/database.js';
import { parseEnvironment } from '../../src/config/env.js';
import { ensureIndexes } from '../../src/models/indexes.js';
import { Application } from '../../src/modules/applications/application.model.js';
import { Document } from '../../src/modules/documents/document.model.js';
import { DocumentStorage } from '../../src/modules/documents/document.storage.js';
import { Loan } from '../../src/modules/loans/loan.model.js';
import { User } from '../../src/modules/auth/user.model.js';
import { createSession } from '../../src/modules/auth/session.js';
import { HttpError } from '../../src/middleware/errors.js';
import { pdf, png } from '../document-fixtures.js';

const dbName = `lms_step6_test_${randomUUID().replaceAll('-', '')}`;
const uri = new URL(process.env.MONGODB_URI!); uri.pathname = `/${dbName}`;
const env = parseEnvironment({ ...process.env, NODE_ENV: 'test', MONGODB_URI: uri.toString(), UPLOAD_DIR: `.cache/${dbName}`, JWT_SECRET: 'isolated-step6-test-secret-not-for-the-application' });
const app = createApp(env);
const storage = new DocumentStorage(env.UPLOAD_DIR);
const headers = { Origin: env.WEB_ORIGIN, 'X-LMS-Request': '1' };
const valid = { fullName: 'Synthetic Applicant', pan: 'ABCDE1234F', dob: '1995-06-15', monthlySalaryPaise: 2_500_000, employmentMode: 'SALARIED' as const };
const staff = {} as Record<Role, string>;
before(async () => {
  await connectDatabase(env); await ensureIndexes(); await storage.prepare();
  for (const role of ['ADMIN', 'SALES', 'SANCTION', 'DISBURSEMENT', 'COLLECTION'] as const) {
    const user = await User.create({ email: `${role}@example.test`, role, passwordHash: 'unused' });
    staff[role] = `lms_session=${await createSession(user.id, env)}`;
  }
});
after(async () => {
  try {
    assert.match(dbName, /^lms_step6_test_[a-f0-9]{32}$/);
    assert.equal(storage.root, new DocumentStorage(`.cache/${dbName}`).root);
    for (const key of await readdir(storage.root)) await storage.remove(key);
    await rmdir(storage.root);
    if (mongoose.connection.readyState === 1) { assert.equal(mongoose.connection.name, dbName); await mongoose.connection.dropDatabase(); }
  } finally { await disconnectDatabase(); }
});
async function fixture(withSlip = true) {
  const user = await User.create({ email: `owner-${randomUUID()}@example.test`, role: 'BORROWER', passwordHash: 'unused' });
  const cookie = `lms_session=${await createSession(user.id, env)}`;
  const draft = await Application.create({ borrowerId: user._id, personalDetails: valid, principalPaise: 10_000_000, tenureDays: 365 });
  if (withSlip) await request(app).post(`/api/v1/borrower/applications/${draft.id}/salary-slip`).set(headers).set('Cookie', cookie).attach('file', pdf, { filename: 'synthetic.pdf', contentType: 'application/pdf' }).expect(201);
  return { cookie, user, draft };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
const submit = (f: Fixture, body: object = {}) => request(app).post(`/api/v1/borrower/applications/${f.draft.id}/submit`).set(headers).set('Cookie', f.cookie).send(body);
const detail = (id: string, cookie: string) => request(app).get(`/api/v1/borrower/loans/${id}`).set('Cookie', cookie);
test('submission atomically creates an APPLIED loan, freezes terms/snapshots/history, and removes the Sales lead', async () => {
  const f = await fixture();
  await request(app).get(`/api/v1/sales/leads/${f.user.id}`).set('Cookie', staff.SALES).expect(200);
  const response = await submit(f).expect(201);
  const loan = reviewedLoanResponseSchema.parse(response.body).data;
  assert.equal(response.headers.location, `/api/v1/borrower/loans/${loan.id}`);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(loan.status, 'APPLIED'); assert.equal(loan.interestPaise, 1_200_000); assert.equal(loan.totalRepaymentPaise, 11_200_000);
  assert.equal(loan.totalPaidPaise, 0); assert.equal(loan.outstandingPaise, 11_200_000);
  assert.deepEqual(loan.applicantSnapshot, { ...valid, email: f.user.email }); assert.equal(loan.eligibilityAtSubmission.eligible, true);
  assert.equal(loan.statusHistory.length, 1); assert.deepEqual(loan.statusHistory[0], { fromStatus: null, toStatus: 'APPLIED', actorId: f.user.id, actorRole: 'BORROWER', occurredAt: loan.eligibilityAtSubmission.evaluatedAt, reason: null });
  for (const key of ['rejectionReason', 'sanctionedAt', 'disbursedAt', 'closedAt'] as const) assert.equal(loan[key], null);
  const saved = await Application.findById(f.draft.id).orFail();
  assert.equal(saved.state, 'SUBMITTED'); assert.equal(saved.submittedAt?.toISOString(), loan.eligibilityAtSubmission.evaluatedAt); assert.equal(saved.salarySlipId!.toHexString(), loan.salarySlip.id);
  const read = reviewedLoanResponseSchema.parse((await detail(loan.id, f.cookie).expect(200)).body).data; assert.deepEqual(read, loan);
  await request(app).get(`/api/v1/sales/leads/${f.user.id}`).set('Cookie', staff.SALES).expect(404);
  for (const role of ['SANCTION', 'ADMIN'] as const) assert.deepEqual((await request(app).get(`/api/v1/documents/${loan.salarySlip.id}`).set('Cookie', staff[role]).expect(200)).body, pdf);
  const application = await request(app).get(`/api/v1/borrower/applications/${f.draft.id}`).set('Cookie', f.cookie).expect(200);
  assert.equal(application.body.data.nextStep, 'SUBMITTED'); assert.equal(application.body.data.loanId, loan.id);
});
test('concurrent submissions and retries return the same loan ID with no duplicates or extra history', async () => {
  const f = await fixture();
  const results = await Promise.all(Array.from({ length: 8 }, () => submit(f)));
  assert.equal(results.filter((result) => result.status === 201).length, 1);
  const loan = results.find((result) => result.status === 201)!.body.data;
  for (const result of results.filter((result) => result.status !== 201)) {
    assert.equal(result.status, 409); assert.equal(result.body.error.code, 'APPLICATION_ALREADY_SUBMITTED'); assert.equal(result.body.error.meta.loanId, loan.id);
  }
  const retry = await submit(f).expect(409); assert.equal(retry.body.error.meta.loanId, loan.id);
  assert.equal(await Loan.countDocuments({ applicationId: f.draft._id }), 1); assert.equal((await Loan.findById(loan.id).orFail()).statusHistory.length, 1);
});
test('complete current BRE, salary-slip linkage and valid persisted terms are required', async () => {
  const f = await fixture(false);
  const missing = await submit(f).expect(422); assert.equal(missing.body.error.code, 'SALARY_SLIP_REQUIRED');
  for (const details of [{ monthlySalaryPaise: 1 }, { pan: 'INVALID' }, { dob: '2010-01-01' }, { employmentMode: 'UNEMPLOYED' }, { fullName: null }]) {
    await Application.updateOne({ _id: f.draft.id }, { $set: { personalDetails: { ...valid, ...details } } });
    const response = await submit(f).expect(422); assert.equal(response.body.error.code, 'BRE_FAILED');
  }
  await Application.updateOne({ _id: f.draft.id }, { $set: { personalDetails: valid } });
  for (const values of [{ principalPaise: 4_999_999 }, { principalPaise: 50_000_001 }, { tenureDays: 29 }, { tenureDays: 366 }, { tenureDays: 30.5 }]) {
    await Application.collection.updateOne({ _id: f.draft._id }, { $set: { principalPaise: 10_000_000, tenureDays: 365, ...values } });
    const response = await submit(f).expect(422); assert.equal(response.body.error.code, 'VALIDATION_FAILED');
    assert.ok(Object.keys(response.body.error.fields).every((key) => key.startsWith('loanConfig.')));
  }
  assert.equal(await Loan.countDocuments({ applicationId: f.draft._id }), 0); assert.equal((await Application.findById(f.draft.id).orFail()).state, 'DRAFT');
});
test('foreign, nonexistent and mismatched document links cannot be submitted', async () => {
  const f = await fixture(false); const foreign = await fixture();
  const slip = (await Application.findById(foreign.draft.id).orFail()).salarySlipId!;
  for (const id of [new Types.ObjectId(), slip]) {
    await Application.updateOne({ _id: f.draft.id }, { $set: { salarySlipId: id } });
    const response = await submit(f).expect(422); assert.equal(response.body.error.code, 'SALARY_SLIP_REQUIRED');
  }
  assert.equal(await Loan.countDocuments({ applicationId: f.draft.id }), 0);
});
test('missing or changed file bytes roll back submission and do not alter the draft', async () => {
  const f = await fixture(); const original = await Application.findById(f.draft.id).lean();
  const slip = await Document.findOne({ applicationId: f.draft.id }).orFail();
  await storage.remove(slip.storageKey);
  try {
    const response = await submit(f).expect(503); assert.equal(response.body.error.code, 'DOCUMENT_UNAVAILABLE');
    await writeFile(storage.path(slip.storageKey), 'broken', { flag: 'wx' });
    await submit(f).expect(503);
    assert.deepEqual(await Application.findById(f.draft.id).lean(), original); assert.equal(await Loan.countDocuments({ applicationId: f.draft.id }), 0);
  } finally { await writeFile(storage.path(slip.storageKey), pdf); }
  await submit(f).expect(201);
});
test('a failed loan insert rolls back the application state and eligibility snapshot', async () => {
  const f = await fixture(); const before = await Application.findById(f.draft.id).lean();
  const fault = mock.method(Loan.prototype, 'save', async () => { throw new HttpError(503, 'TEST_FAILURE', 'Synthetic insert failure.'); });
  try { await submit(f).expect(503); } finally { fault.mock.restore(); }
  assert.deepEqual(await Application.findById(f.draft.id).lean(), before); assert.equal(await Loan.countDocuments({ applicationId: f.draft.id }), 0);
  await submit(f).expect(201);
});
test('a lost commit response can be retried without creating another loan', async () => {
  const f = await fixture();
  const transaction = mongoose.connection.transaction.bind(mongoose.connection);
  const fault = mock.method(mongoose.connection, 'transaction', async (...args: Parameters<typeof mongoose.connection.transaction>) => {
    await transaction(...args);
    const error = new mongoose.mongo.MongoServerError({ message: 'Synthetic lost commit response' }); error.addErrorLabel('UnknownTransactionCommitResult'); throw error;
  });
  try { const response = await submit(f).expect(503); assert.equal(response.body.error.code, 'SUBMISSION_UNCONFIRMED'); } finally { fault.mock.restore(); }
  const retry = await submit(f).expect(409);
  await detail(retry.body.error.meta.loanId, f.cookie).expect(200); assert.equal(await Loan.countDocuments({ applicationId: f.draft.id }), 1);
});
test('client-supplied totals, rates, snapshots, ownership, queries and invalid bodies are rejected', async () => {
  const f = await fixture();
  for (const body of [{ interestPaise: 0 }, { annualRatePercent: 0 }, { totalRepaymentPaise: 1 }, { loanConfig: { principalPaise: 1, tenureDays: 1 } }, { borrowerId: f.user.id }, { salarySlipId: new Types.ObjectId().toHexString() }, { eligible: true }, { state: 'SUBMITTED' }, { applicantSnapshot: valid }]) await submit(f, body).expect(422);
  await submit(f).query({ extra: 'true' }).expect(422);
  await request(app).post(`/api/v1/borrower/applications/${f.draft.id}/submit`).set(headers).set('Cookie', f.cookie).type('form').send({ principal: 1 }).expect(415);
  assert.equal(await Loan.countDocuments({ applicationId: f.draft.id }), 0);
  const response = await submit(f).expect(201); assert.equal(response.body.data.interestPaise, 1_200_000);
});
test('submission and loan reads enforce anonymous, foreign, malformed ID and all staff-role boundaries', async () => {
  const f = await fixture(); const foreign = await fixture(false);
  await submit(f).unset('Cookie').expect(401); await submit(f).unset('Origin').expect(403); await submit(f).unset('X-LMS-Request').expect(403);
  await submit(f).set('Cookie', foreign.cookie).expect(404);
  await request(app).post('/api/v1/borrower/applications/invalid/submit').set(headers).set('Cookie', f.cookie).expect(400);
  const loan = (await submit(f).expect(201)).body.data;
  await detail(loan.id, '').expect(401); await detail(loan.id, foreign.cookie).expect(404); await detail('invalid', f.cookie).expect(400);
  await detail(new Types.ObjectId().toHexString(), f.cookie).expect(404); await detail(loan.id, f.cookie).query({ extra: '1' }).expect(422); await detail(loan.id, f.cookie).send({ body: true }).expect(400);
  for (const role of ['ADMIN', 'SALES', 'SANCTION', 'DISBURSEMENT', 'COLLECTION'] as const) {
    await submit(f).set('Cookie', staff[role]).expect(403); await detail(loan.id, staff[role]).expect(403); await request(app).get('/api/v1/borrower/loans').set('Cookie', staff[role]).expect(403);
  }
});
test('submitted data cannot be edited or replaced and new drafts do not alter previous snapshots', async () => {
  const f = await fixture(); const loan = (await submit(f).expect(201)).body.data;
  await request(app).patch(`/api/v1/borrower/applications/${f.draft.id}`).set(headers).set('Cookie', f.cookie).send({ personalDetails: { fullName: 'Changed' }, loanConfig: { principalPaise: 5_000_000 } }).expect(409);
  await request(app).post(`/api/v1/borrower/applications/${f.draft.id}/salary-slip`).set(headers).set('Cookie', f.cookie).attach('file', png, { filename: 'new.png', contentType: 'image/png' }).expect(409);
  const next = await request(app).post('/api/v1/borrower/applications').set(headers).set('Cookie', f.cookie).expect(201);
  assert.notEqual(next.body.data.id, f.draft.id);
  await request(app).patch(`/api/v1/borrower/applications/${next.body.data.id}`).set(headers).set('Cookie', f.cookie).send({ personalDetails: { ...valid, fullName: 'New Draft Name' }, loanConfig: { principalPaise: 5_000_001, tenureDays: 30 } }).expect(200);
  await User.updateOne({ _id: f.user.id }, { $set: { email: `changed-${randomUUID()}@example.test` } });
  assert.deepEqual((await detail(loan.id, f.cookie).expect(200)).body.data, loan);
  await request(app).get(`/api/v1/sales/leads/${f.user.id}`).set('Cookie', staff.SALES).expect(404);
});
test('concurrent edits and replacements either commit before submission or are rejected after it', async () => {
  for (let attempt = 0; attempt < 4; attempt++) {
    const f = await fixture();
    const oldSlip = (await Application.findById(f.draft.id).orFail()).salarySlipId!.toHexString();
    const replacement = request(app).post(`/api/v1/borrower/applications/${f.draft.id}/salary-slip`).set(headers).set('Cookie', f.cookie).attach('file', png, { filename: 'racing.png', contentType: 'image/png' });
    const patch = request(app).patch(`/api/v1/borrower/applications/${f.draft.id}`).set(headers).set('Cookie', f.cookie).send({ personalDetails: { fullName: 'Concurrent Applicant' }, loanConfig: { principalPaise: 5_000_001, tenureDays: 30 } });
    const [submitted, replaced, edited] = await Promise.all([submit(f), replacement, patch]);
    assert.equal(submitted.status, 201); assert.ok([201, 409].includes(replaced.status)); assert.ok([200, 409].includes(edited.status));
    const loan = reviewedLoanResponseSchema.parse(submitted.body).data;
    assert.equal(loan.salarySlip.id, replaced.status === 201 ? replaced.body.data.id : oldSlip);
    assert.equal(loan.applicantSnapshot.fullName, edited.status === 200 ? 'Concurrent Applicant' : valid.fullName);
    assert.equal(loan.principalPaise, edited.status === 200 ? 5_000_001 : 10_000_000);
    const application = await Application.findById(f.draft.id).orFail(); assert.equal(application.salarySlipId!.toHexString(), loan.salarySlip.id); assert.equal(application.state, 'SUBMITTED');
    assert.equal(await Document.countDocuments({ applicationId: f.draft.id }), 1);
    const slip = await Document.findById(loan.salarySlip.id).orFail(); const handle = await storage.open(slip.storageKey, slip.sizeBytes); await handle.close();
  }
  assert.ok((await readdir(storage.root)).every((key) => !key.endsWith('.upload')));
});
test('borrower history is owner-scoped, strict, paginated, status-filtered and exposes only summary fields', async () => {
  const f = await fixture(); const first = (await submit(f).expect(201)).body.data;
  await Application.create({ borrowerId: f.user.id, personalDetails: valid, salarySlipId: null });
  const clone = await Loan.findById(first.id).orFail();
  const second = new Loan({ ...clone.toObject(), _id: new Types.ObjectId(), applicationId: new Types.ObjectId(), createdAt: new Date(Date.now() + 1000), status: 'CLOSED', totalPaidPaise: clone.totalRepaymentPaise }); await second.save();
  const page = async (query = '') => loanPageSchema.parse((await request(app).get(`/api/v1/borrower/loans${query}`).set('Cookie', f.cookie).expect(200)).body);
  const firstPage = await page('?limit=1'); const secondPage = await page('?limit=1&page=2');
  assert.equal(firstPage.pagination.total, 2); assert.equal(firstPage.data[0]!.id, second.id); assert.equal(secondPage.data[0]!.id, first.id);
  const closed = await page('?status=CLOSED'); assert.equal(closed.pagination.total, 1); assert.equal(closed.data[0]!.outstandingPaise, 0);
  assert.equal((await page('?page=9007199254740991&limit=100')).data.length, 0);
  for (const query of ['q=forbidden', 'status=PENDING', 'limit=101', 'page=0', 'status=ALL&status=APPLIED']) await request(app).get(`/api/v1/borrower/loans?${query}`).set('Cookie', f.cookie).expect(422);
  const json = JSON.stringify(firstPage);
  for (const privateField of ['storageKey', 'passwordHash', 'applicantSnapshot', 'salarySlip', 'pan', 'dob', '"_id"', '"__v"']) assert.equal(json.includes(privateField), false, privateField);
  const foreign = await fixture(false); const empty = await request(app).get('/api/v1/borrower/loans').set('Cookie', foreign.cookie).expect(200); assert.equal(empty.body.pagination.total, 0);
});
