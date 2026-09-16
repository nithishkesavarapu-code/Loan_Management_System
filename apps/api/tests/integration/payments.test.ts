import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir, rmdir } from 'node:fs/promises';
import { after, before, mock, test } from 'node:test';
import mongoose from 'mongoose';
import request from 'supertest';
import { collectionLoanPageSchema, indiaDate, loanDetailResponseSchema, paymentPageSchema, recordPaymentResponseSchema, reviewedLoanResponseSchema, type Role } from '@lms/shared';
import { createApp } from '../../src/app.js';
import { connectDatabase, disconnectDatabase } from '../../src/config/database.js';
import { parseEnvironment } from '../../src/config/env.js';
import { ensureIndexes } from '../../src/models/indexes.js';
import { Application } from '../../src/modules/applications/application.model.js';
import { User } from '../../src/modules/auth/user.model.js';
import { DocumentStorage } from '../../src/modules/documents/document.storage.js';
import { Loan } from '../../src/modules/loans/loan.model.js';
import { Payment } from '../../src/modules/payments/payment.model.js';
import { recordPayment } from '../../src/modules/payments/payment.service.js';
import { createSession } from '../../src/modules/auth/session.js';
import { pdf } from '../document-fixtures.js';

const dbName = `lms_step8_test_${randomUUID().replaceAll('-', '')}`;
const uri = new URL(process.env.MONGODB_URI!); uri.pathname = `/${dbName}`;
const env = parseEnvironment({ ...process.env, NODE_ENV: 'test', MONGODB_URI: uri.toString(), UPLOAD_DIR: `.cache/${dbName}`, JWT_SECRET: 'isolated-step8-test-secret-not-for-the-application' });
const app = createApp(env);
const storage = new DocumentStorage(env.UPLOAD_DIR);
const headers = { Origin: env.WEB_ORIGIN, 'X-LMS-Request': '1' };
const details = { fullName: 'Step Eight Applicant', pan: 'ABCDE1234F', dob: '1995-06-15', monthlySalaryPaise: 2_500_000, employmentMode: 'SALARIED' as const };
const staff = {} as Record<Role, string>;
const staffIds = {} as Record<Role, string>;
const paymentDate = () => indiaDate(new Date());

before(async () => {
  await connectDatabase(env); await ensureIndexes(); await storage.prepare();
  for (const role of ['ADMIN', 'SALES', 'SANCTION', 'DISBURSEMENT', 'COLLECTION'] as const) {
    const user = await User.create({ email: `step8-${role}@example.test`, role, passwordHash: 'unused' });
    staff[role] = `lms_session=${await createSession(user.id, env)}`;
    staffIds[role] = user.id;
  }
});
after(async () => {
  try {
    assert.match(dbName, /^lms_step8_test_[a-f0-9]{32}$/);
    for (const key of await readdir(storage.root).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return []; throw error; })) await storage.remove(key);
    await rmdir(storage.root).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; });
    if (mongoose.connection.readyState === 1) { assert.equal(mongoose.connection.name, dbName); await mongoose.connection.dropDatabase(); }
  } finally { await disconnectDatabase(); }
});

async function disbursed(name = details.fullName) {
  const user = await User.create({ email: `step8-owner-${randomUUID()}@example.test`, role: 'BORROWER', passwordHash: 'unused' });
  const cookie = `lms_session=${await createSession(user.id, env)}`;
  const application = await Application.create({ borrowerId: user._id, personalDetails: { ...details, fullName: name }, principalPaise: 10_000_000, tenureDays: 365 });
  await request(app).post(`/api/v1/borrower/applications/${application.id}/salary-slip`).set(headers).set('Cookie', cookie).attach('file', pdf, { filename: 'step-eight.pdf', contentType: 'application/pdf' }).expect(201);
  const submitted = await request(app).post(`/api/v1/borrower/applications/${application.id}/submit`).set(headers).set('Cookie', cookie).send({}).expect(201);
  const loan = reviewedLoanResponseSchema.parse(submitted.body).data;
  await request(app).post(`/api/v1/sanction/loans/${loan.id}/decision`).set(headers).set('Cookie', staff.SANCTION).send({ decision: 'APPROVE' }).expect(200);
  const released = await request(app).post(`/api/v1/disbursement/loans/${loan.id}/disburse`).set(headers).set('Cookie', staff.DISBURSEMENT).send({}).expect(200);
  return { user, cookie, loan: loanDetailResponseSchema.parse(released.body).data };
}

const pay = (id: string, cookie: string, body: object) => request(app).post(`/api/v1/collection/loans/${id}/payments`).set(headers).set('Cookie', cookie).send(body);

test('partial and exact payments update the ledger, close the loan, and remain visible to both roles', async () => {
  const fixture = await disbursed('Closing Ledger');
  const partial = recordPaymentResponseSchema.parse((await pay(fixture.loan.id, staff.COLLECTION, { utr: '  step8-partial-1  ', amountPaise: 4_000_000, paymentDate: paymentDate() }).expect(201)).body).data;
  assert.equal(partial.payment.utr, 'STEP8-PARTIAL-1');
  assert.equal(partial.loan.status, 'DISBURSED'); assert.equal(partial.loan.totalPaidPaise, 4_000_000);
  assert.equal(partial.loan.outstandingPaise, fixture.loan.totalRepaymentPaise - 4_000_000);
  const collectionPayments = paymentPageSchema.parse((await request(app).get(`/api/v1/collection/loans/${fixture.loan.id}/payments`).set('Cookie', staff.COLLECTION).expect(200)).body);
  assert.equal(collectionPayments.pagination.total, 1); assert.equal(collectionPayments.data[0]!.utr, 'STEP8-PARTIAL-1');
  const borrowerPayments = paymentPageSchema.parse((await request(app).get(`/api/v1/borrower/loans/${fixture.loan.id}/payments`).set('Cookie', fixture.cookie).expect(200)).body);
  assert.deepEqual(borrowerPayments.data, collectionPayments.data);

  const final = recordPaymentResponseSchema.parse((await pay(fixture.loan.id, staff.COLLECTION, { utr: 'STEP8-FINAL-1', amountPaise: partial.loan.outstandingPaise, paymentDate: paymentDate() }).expect(201)).body).data;
  assert.equal(final.loan.status, 'CLOSED'); assert.equal(final.loan.outstandingPaise, 0); assert.ok(final.loan.closedAt);
  assert.equal(final.loan.statusHistory.at(-1)!.fromStatus, 'DISBURSED'); assert.equal(final.loan.statusHistory.at(-1)!.toStatus, 'CLOSED');
  assert.equal(final.loan.statusHistory.at(-1)!.actorId, staffIds.COLLECTION);
  const storedPayments = await Payment.find({ loanId: fixture.loan.id });
  assert.equal(storedPayments.reduce((sum, entry) => sum + entry.amountPaise, 0), final.loan.totalPaidPaise);
  assert.equal((await Loan.findById(fixture.loan.id).orFail()).totalPaidPaise, final.loan.totalRepaymentPaise);

  assert.equal(collectionLoanPageSchema.parse((await request(app).get('/api/v1/collection/loans').set('Cookie', staff.COLLECTION).expect(200)).body).pagination.total, 0);
  const closed = collectionLoanPageSchema.parse((await request(app).get('/api/v1/collection/loans?status=CLOSED').set('Cookie', staff.COLLECTION).expect(200)).body);
  assert.equal(closed.pagination.total, 1); assert.equal(closed.data[0]!.id, fixture.loan.id);
  await pay(fixture.loan.id, staff.COLLECTION, { utr: 'STEP8-AFTER-CLOSE', amountPaise: 1, paymentDate: paymentDate() }).expect(409).expect(({ body }) => assert.equal(body.error.code, 'INVALID_LOAN_STATE'));
  await pay(fixture.loan.id, staff.COLLECTION, { utr: 'step8-final-1', amountPaise: 1, paymentDate: paymentDate() }).expect(409).expect(({ body }) => assert.equal(body.error.code, 'UTR_ALREADY_EXISTS'));
});

test('payment validation, scope, strictness, ownership, and role checks reject direct bypasses', async () => {
  const fixture = await disbursed('Validation Ledger');
  for (const body of [
    { utr: '', amountPaise: 1, paymentDate: paymentDate() },
    { utr: 'STEP8-ZERO', amountPaise: 0, paymentDate: paymentDate() },
    { utr: 'STEP8-FRACTION', amountPaise: 1.5, paymentDate: paymentDate() },
    { utr: 'STEP8-UNKNOWN', amountPaise: 1, paymentDate: paymentDate(), status: 'CLOSED' },
  ]) await pay(fixture.loan.id, staff.COLLECTION, body).expect(422).expect(({ body: response }) => assert.equal(response.error.code, 'VALIDATION_FAILED'));
  await pay(fixture.loan.id, staff.COLLECTION, { utr: 'STEP8-OVER', amountPaise: fixture.loan.totalRepaymentPaise + 1, paymentDate: paymentDate() }).expect(422).expect(({ body }) => assert.equal(body.error.code, 'PAYMENT_EXCEEDS_OUTSTANDING'));
  for (const date of ['1999-01-01', '2099-01-01']) await pay(fixture.loan.id, staff.COLLECTION, { utr: `STEP8-DATE-${date}`, amountPaise: 1, paymentDate: date }).expect(422).expect(({ body }) => assert.equal(body.error.code, 'PAYMENT_DATE_INVALID'));
  await request(app).post(`/api/v1/collection/loans/${fixture.loan.id}/payments`).set(headers).set('Cookie', staff.COLLECTION).query({ forged: '1' }).send({ utr: 'STEP8-QUERY', amountPaise: 1, paymentDate: paymentDate() }).expect(422);
  await request(app).get('/api/v1/collection/loans').set('Cookie', staff.SANCTION).expect(403);
  await request(app).get(`/api/v1/collection/loans/${fixture.loan.id}`).set('Cookie', fixture.cookie).expect(403);
  for (const cookie of [fixture.cookie, staff.SALES, staff.SANCTION, staff.DISBURSEMENT]) {
    await pay(fixture.loan.id, cookie, { utr: 'STEP8-FORBIDDEN', amountPaise: 1, paymentDate: paymentDate() }).expect(403);
  }
  await pay(fixture.loan.id, staff.COLLECTION, { utr: 'STEP8-ANONYMOUS', amountPaise: 1, paymentDate: paymentDate() }).unset('Cookie').expect(401);
  for (const header of ['Origin', 'X-LMS-Request']) await pay(fixture.loan.id, staff.COLLECTION, { utr: 'STEP8-CSRF', amountPaise: 1, paymentDate: paymentDate() }).unset(header).expect(403);
  const other = await disbursed('Other Borrower');
  await request(app).get(`/api/v1/borrower/loans/${fixture.loan.id}/payments`).set('Cookie', other.cookie).expect(404);
  assert.equal(await Payment.countDocuments({ loanId: fixture.loan.id }), 0);
});

test('UTRs are unique across loans after trim/uppercase normalization', async () => {
  const first = await disbursed('First UTR'); const second = await disbursed('Second UTR');
  await pay(first.loan.id, staff.COLLECTION, { utr: '  step8-global-utr  ', amountPaise: 1_000_000, paymentDate: paymentDate() }).expect(201);
  await pay(second.loan.id, staff.ADMIN, { utr: 'STEP8-GLOBAL-UTR', amountPaise: 1_000_000, paymentDate: paymentDate() }).expect(409).expect(({ body }) => assert.equal(body.error.code, 'UTR_ALREADY_EXISTS'));
  assert.equal((await Loan.findById(second.loan.id).orFail()).totalPaidPaise, 0);
});

test('concurrent conflicting payments cannot exceed the balance or create an inconsistent ledger', async () => {
  const fixture = await disbursed('Concurrent Ledger');
  const results = await Promise.all([
    pay(fixture.loan.id, staff.COLLECTION, { utr: 'STEP8-CONCURRENT-A', amountPaise: 6_000_000, paymentDate: paymentDate() }),
    pay(fixture.loan.id, staff.ADMIN, { utr: 'STEP8-CONCURRENT-B', amountPaise: 6_000_000, paymentDate: paymentDate() }),
  ]);
  assert.equal(results.filter((response) => response.status === 201).length, 1);
  assert.equal(results.filter((response) => response.status === 409 || response.status === 422).length, 1);
  const stored = await Loan.findById(fixture.loan.id).orFail();
  const payments = await Payment.find({ loanId: fixture.loan.id });
  assert.equal(payments.reduce((sum, entry) => sum + entry.amountPaise, 0), stored.totalPaidPaise);
  assert.ok(stored.totalPaidPaise <= stored.totalRepaymentPaise);
});

test('a transaction rollback removes a payment created before a conditional loan write fails', async () => {
  const fixture = await disbursed('Rollback Ledger');
  const fault = mock.method(Loan, 'findOneAndUpdate', () => null);
  try {
    await assert.rejects(recordPayment(fixture.loan.id, { id: staffIds.COLLECTION, role: 'COLLECTION' }, { utr: 'STEP8-ROLLBACK', amountPaise: 1_000_000, paymentDate: paymentDate() }), { code: 'INVALID_LOAN_STATE' });
  } finally {
    fault.mock.restore();
  }
  assert.equal(await Payment.countDocuments({ loanId: fixture.loan.id }), 0);
  assert.equal((await Loan.findById(fixture.loan.id).orFail()).totalPaidPaise, 0);
});

test('simultaneous duplicate UTRs on different loans write exactly one payment and one balance', async () => {
  const first = await disbursed('Duplicate Race First'); const second = await disbursed('Duplicate Race Second');
  const results = await Promise.all([first, second].map((fixture) => pay(fixture.loan.id, staff.COLLECTION, { utr: 'STEP8-DUPLICATE-RACE', amountPaise: 12345, paymentDate: paymentDate() })));
  assert.deepEqual(results.map((response) => response.status).sort(), [201, 409]);
  assert.equal(results.find((response) => response.status === 409)!.body.error.code, 'UTR_ALREADY_EXISTS');
  const loans = await Loan.find({ _id: { $in: [first.loan.id, second.loan.id] } });
  assert.equal(loans.reduce((sum, loan) => sum + loan.totalPaidPaise, 0), 12345);
  assert.equal(await Payment.countDocuments({ utrNormalized: 'STEP8-DUPLICATE-RACE' }), 1);
});

test('two concurrent payments that exactly cover repayment commit once each and close once', async () => {
  const fixture = await disbursed('Exact Concurrent Ledger');
  const results = await Promise.all([
    pay(fixture.loan.id, staff.COLLECTION, { utr: 'STEP8-EXACT-A', amountPaise: 4_000_000, paymentDate: paymentDate() }),
    pay(fixture.loan.id, staff.ADMIN, { utr: 'STEP8-EXACT-B', amountPaise: 7_200_000, paymentDate: paymentDate() }),
  ]);
  assert.deepEqual(results.map((response) => response.status), [201, 201]);
  const stored = await Loan.findById(fixture.loan.id).orFail();
  assert.equal(stored.status, 'CLOSED'); assert.equal(stored.totalPaidPaise, stored.totalRepaymentPaise);
  assert.equal(stored.statusHistory.filter((event) => event.toStatus === 'CLOSED').length, 1);
  assert.equal(await Payment.countDocuments({ loanId: stored._id }), 2);
});

test('date validation uses the disbursement day and current day in Asia/Kolkata', async () => {
  const fixture = await disbursed('Timezone Ledger');
  await Loan.updateOne({ _id: fixture.loan.id }, { $set: { disbursedAt: new Date('2026-01-01T18:30:00Z') } });
  const actor = { id: staffIds.COLLECTION, role: 'COLLECTION' as const };
  const now = new Date('2026-01-02T18:30:00Z');
  for (const date of ['2026-01-01', '2026-01-04']) await assert.rejects(recordPayment(fixture.loan.id, actor, { utr: `STEP8-TZ-${date}`, amountPaise: 1, paymentDate: date }, now), { code: 'PAYMENT_DATE_INVALID' });
  for (const date of ['2026-01-02', '2026-01-03']) await recordPayment(fixture.loan.id, actor, { utr: `STEP8-TZ-${date}`, amountPaise: 1, paymentDate: date }, now);
  assert.equal((await Loan.findById(fixture.loan.id).orFail()).totalPaidPaise, 2);
});

test('collection reads hide pre-disbursement loans and private applicant data, with strict history queries', async () => {
  const fixture = await disbursed('Literal.* Collection');
  const detail = loanDetailResponseSchema.parse((await request(app).get(`/api/v1/collection/loans/${fixture.loan.id}`).set('Cookie', staff.COLLECTION).expect(200)).body).data;
  for (const field of ['applicantSnapshot', 'salarySlip', 'pan', 'dob', 'monthlySalaryPaise']) assert.equal(Object.hasOwn(detail, field), false);
  const page = collectionLoanPageSchema.parse((await request(app).get('/api/v1/collection/loans').query({ q: 'literal.*', status: 'ALL', limit: '1' }).set('Cookie', staff.COLLECTION).expect(200)).body);
  assert.equal(page.pagination.total, 1); assert.equal(page.data[0]!.id, fixture.loan.id);
  await request(app).get('/api/v1/collection/loans?status=SANCTIONED').set('Cookie', staff.COLLECTION).expect(422);
  await request(app).get(`/api/v1/collection/loans/${fixture.loan.id}/payments?sort=amount`).set('Cookie', staff.COLLECTION).expect(422);
  await Loan.updateOne({ _id: fixture.loan.id }, { $set: { status: 'APPLIED' } });
  for (const path of ['', '/payments']) await request(app).get(`/api/v1/collection/loans/${fixture.loan.id}${path}`).set('Cookie', staff.COLLECTION).expect(404);
  await pay(fixture.loan.id, staff.COLLECTION, { utr: 'STEP8-OUT-OF-SCOPE', amountPaise: 1, paymentDate: paymentDate() }).expect(404);
  const empty = paymentPageSchema.parse((await request(app).get(`/api/v1/borrower/loans/${fixture.loan.id}/payments`).set('Cookie', fixture.cookie).expect(200)).body);
  assert.equal(empty.pagination.total, 0);
});

test('ledger pagination is deterministic and supports borrower history beyond the first page', async () => {
  const fixture = await disbursed('Paginated Ledger');
  for (let index = 0; index < 3; index++) await pay(fixture.loan.id, staff.ADMIN, { utr: `STEP8-PAGE-${index}`, amountPaise: 1, paymentDate: paymentDate() }).expect(201);
  for (const [prefix, cookie] of [['collection', staff.COLLECTION], ['borrower', fixture.cookie]]) {
    const first = paymentPageSchema.parse((await request(app).get(`/api/v1/${prefix}/loans/${fixture.loan.id}/payments?limit=2`).set('Cookie', cookie!).expect(200)).body);
    const second = paymentPageSchema.parse((await request(app).get(`/api/v1/${prefix}/loans/${fixture.loan.id}/payments?limit=2&page=2`).set('Cookie', cookie!).expect(200)).body);
    assert.equal(first.pagination.total, 3); assert.equal(first.data.length, 2); assert.equal(second.data.length, 1);
    assert.deepEqual([...first.data, ...second.data].map((entry) => entry.utr), ['STEP8-PAGE-2', 'STEP8-PAGE-1', 'STEP8-PAGE-0']);
  }
});

test('a lost commit response is recoverable with the same UTR without applying the payment twice', async () => {
  const fixture = await disbursed('Unconfirmed Ledger');
  const transaction = mongoose.connection.transaction.bind(mongoose.connection);
  const fault = mock.method(mongoose.connection, 'transaction', async (...args: Parameters<typeof mongoose.connection.transaction>) => {
    await transaction(...args);
    const error = new mongoose.mongo.MongoServerError({ message: 'Synthetic lost commit response' }); error.addErrorLabel('UnknownTransactionCommitResult'); throw error;
  });
  const body = { utr: 'STEP8-UNCONFIRMED', amountPaise: 54321, paymentDate: paymentDate() };
  try { await pay(fixture.loan.id, staff.COLLECTION, body).expect(503).expect(({ body }) => assert.equal(body.error.code, 'PAYMENT_UNCONFIRMED')); }
  finally { fault.mock.restore(); }
  await pay(fixture.loan.id, staff.COLLECTION, body).expect(409).expect(({ body }) => assert.equal(body.error.code, 'UTR_ALREADY_EXISTS'));
  assert.equal((await Loan.findById(fixture.loan.id).orFail()).totalPaidPaise, 54321);
  assert.equal(await Payment.countDocuments({ loanId: fixture.loan.id }), 1);
});
