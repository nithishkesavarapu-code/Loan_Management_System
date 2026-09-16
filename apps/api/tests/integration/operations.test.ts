import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir, rmdir } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import request from 'supertest';
import { disbursementLoanPageSchema, indiaDate, loanDetailResponseSchema, reviewedLoanResponseSchema, sanctionLoanPageSchema, type Role } from '@lms/shared';
import { createApp } from '../../src/app.js';
import { connectDatabase, disconnectDatabase } from '../../src/config/database.js';
import { parseEnvironment } from '../../src/config/env.js';
import { ensureIndexes } from '../../src/models/indexes.js';
import { Application } from '../../src/modules/applications/application.model.js';
import { DocumentStorage } from '../../src/modules/documents/document.storage.js';
import { Loan } from '../../src/modules/loans/loan.model.js';
import { Payment } from '../../src/modules/payments/payment.model.js';
import { User } from '../../src/modules/auth/user.model.js';
import { createSession } from '../../src/modules/auth/session.js';
import { pdf } from '../document-fixtures.js';

const dbName = `lms_step7_test_${randomUUID().replaceAll('-', '')}`;
const uri = new URL(process.env.MONGODB_URI!); uri.pathname = `/${dbName}`;
const env = parseEnvironment({ ...process.env, NODE_ENV: 'test', MONGODB_URI: uri.toString(), UPLOAD_DIR: `.cache/${dbName}`, JWT_SECRET: 'isolated-step7-test-secret-not-for-the-application' });
const app = createApp(env);
const storage = new DocumentStorage(env.UPLOAD_DIR);
const headers = { Origin: env.WEB_ORIGIN, 'X-LMS-Request': '1' };
const details = { fullName: 'Step Seven Applicant', pan: 'ABCDE1234F', dob: '1995-06-15', monthlySalaryPaise: 2_500_000, employmentMode: 'SALARIED' as const };
const staff = {} as Record<Role, string>;

before(async () => {
  await connectDatabase(env); await ensureIndexes(); await storage.prepare();
  for (const role of ['ADMIN', 'SALES', 'SANCTION', 'DISBURSEMENT', 'COLLECTION'] as const) {
    const user = await User.create({ email: `step7-${role}@example.test`, role, passwordHash: 'unused' });
    staff[role] = `lms_session=${await createSession(user.id, env)}`;
  }
});
after(async () => {
  try {
    assert.match(dbName, /^lms_step7_test_[a-f0-9]{32}$/);
    for (const key of await readdir(storage.root)) await storage.remove(key);
    await rmdir(storage.root);
    if (mongoose.connection.readyState === 1) { assert.equal(mongoose.connection.name, dbName); await mongoose.connection.dropDatabase(); }
  } finally { await disconnectDatabase(); }
});
async function submitted(name = details.fullName) {
  const user = await User.create({ email: `step7-owner-${randomUUID()}@example.test`, role: 'BORROWER', passwordHash: 'unused' });
  const cookie = `lms_session=${await createSession(user.id, env)}`;
  const application = await Application.create({ borrowerId: user._id, personalDetails: { ...details, fullName: name }, principalPaise: 10_000_000, tenureDays: 365 });
  await request(app).post(`/api/v1/borrower/applications/${application.id}/salary-slip`).set(headers).set('Cookie', cookie).attach('file', pdf, { filename: 'step-seven.pdf', contentType: 'application/pdf' }).expect(201);
  const response = await request(app).post(`/api/v1/borrower/applications/${application.id}/submit`).set(headers).set('Cookie', cookie).send({}).expect(201);
  return { user, cookie, application, loan: reviewedLoanResponseSchema.parse(response.body).data };
}
const decide = (id: string, cookie: string, body: object) => request(app).post(`/api/v1/sanction/loans/${id}/decision`).set(headers).set('Cookie', cookie).send(body);
const disburse = (id: string, cookie: string) => request(app).post(`/api/v1/disbursement/loans/${id}/disburse`).set(headers).set('Cookie', cookie).send({});

test('Sanction queue exposes submitted review data, supports literal search, and records one rejection visible to the borrower', async () => {
  const first = await submitted('Ada Review'); const second = await submitted('Bela Queue');
  const page = sanctionLoanPageSchema.parse((await request(app).get('/api/v1/sanction/loans?limit=1').set('Cookie', staff.SANCTION).expect(200)).body);
  assert.equal(page.pagination.total, 2); assert.equal(page.data[0]!.status, 'APPLIED');
  const searched = sanctionLoanPageSchema.parse((await request(app).get('/api/v1/sanction/loans?q=ada%20review').set('Cookie', staff.SANCTION).expect(200)).body);
  assert.equal(searched.pagination.total, 1); assert.equal(searched.data[0]!.id, first.loan.id);
  const review = reviewedLoanResponseSchema.parse((await request(app).get(`/api/v1/sanction/loans/${first.loan.id}`).set('Cookie', staff.SANCTION).expect(200)).body).data;
  assert.equal(review.applicantSnapshot.pan, details.pan); assert.equal(review.salarySlip.originalName, 'step-seven.pdf');
  await decide(first.loan.id, staff.SANCTION, { decision: 'REJECT', reason: '   ' }).expect(422);
  const decision = reviewedLoanResponseSchema.parse((await decide(first.loan.id, staff.SANCTION, { decision: 'REJECT', reason: '  Uploaded income evidence is incomplete.  ' }).expect(200)).body).data;
  assert.equal(decision.status, 'REJECTED'); assert.equal(decision.rejectionReason, 'Uploaded income evidence is incomplete.');
  assert.equal(decision.statusHistory.at(-1)!.fromStatus, 'APPLIED'); assert.equal(decision.statusHistory.at(-1)!.toStatus, 'REJECTED');
  assert.equal(decision.statusHistory.at(-1)!.actorId, (await User.findOne({ role: 'SANCTION' }).orFail()).id); assert.equal(decision.statusHistory.at(-1)!.actorRole, 'SANCTION');
  assert.equal(decision.statusHistory.at(-1)!.reason, decision.rejectionReason); assert.ok(!Number.isNaN(Date.parse(decision.statusHistory.at(-1)!.occurredAt)));
  const borrower = reviewedLoanResponseSchema.parse((await request(app).get(`/api/v1/borrower/loans/${first.loan.id}`).set('Cookie', first.cookie).expect(200)).body).data;
  assert.equal(borrower.status, 'REJECTED'); assert.equal(borrower.rejectionReason, decision.rejectionReason);
  const rejected = sanctionLoanPageSchema.parse((await request(app).get('/api/v1/sanction/loans?status=REJECTED').set('Cookie', staff.SANCTION).expect(200)).body);
  assert.equal(rejected.pagination.total, 1); assert.equal(rejected.data[0]!.id, first.loan.id);
  await decide(first.loan.id, staff.ADMIN, { decision: 'APPROVE' }).expect(409);
  await decide(first.loan.id, staff.SANCTION, { decision: 'REJECT', reason: 'A second reason cannot replace the first.' }).expect(409);
  await disburse(first.loan.id, staff.DISBURSEMENT).expect(409);
  const rejectedStored = await Loan.findById(first.loan.id).orFail();
  assert.equal(rejectedStored.statusHistory.length, 2); assert.equal(rejectedStored.rejectionReason, decision.rejectionReason);
  assert.equal((await Loan.findById(second.loan.id).orFail()).status, 'APPLIED');
});

test('approval is a conditional one-time transition and moves the loan into the disbursement queue', async () => {
  const fixture = await submitted();
  const results = await Promise.all([decide(fixture.loan.id, staff.SANCTION, { decision: 'APPROVE' }), decide(fixture.loan.id, staff.ADMIN, { decision: 'APPROVE' })]);
  assert.equal(results.filter((response) => response.status === 200).length, 1);
  assert.equal(results.filter((response) => response.status === 409).length, 1);
  const stored = await Loan.findById(fixture.loan.id).orFail();
  assert.equal(stored.status, 'SANCTIONED'); assert.ok(stored.sanctionedAt); assert.equal(stored.rejectionReason, null); assert.equal(stored.statusHistory.length, 2);
  await decide(fixture.loan.id, staff.SANCTION, { decision: 'REJECT', reason: 'Cannot reject after approval.' }).expect(409);
  assert.equal((await Loan.findById(fixture.loan.id).orFail()).rejectionReason, null);
  assert.equal(stored.statusHistory[1]!.fromStatus, 'APPLIED'); assert.equal(stored.statusHistory[1]!.toStatus, 'SANCTIONED'); assert.ok(['SANCTION', 'ADMIN'].includes(stored.statusHistory[1]!.actorRole));
  const queue = disbursementLoanPageSchema.parse((await request(app).get('/api/v1/disbursement/loans').set('Cookie', staff.DISBURSEMENT).expect(200)).body);
  assert.equal(queue.pagination.total, 1); assert.equal(queue.data[0]!.id, fixture.loan.id);
  const detail = loanDetailResponseSchema.parse((await request(app).get(`/api/v1/disbursement/loans/${fixture.loan.id}`).set('Cookie', staff.DISBURSEMENT).expect(200)).body).data;
  assert.equal(detail.status, 'SANCTIONED');
  for (const privateField of ['applicantSnapshot', 'salarySlip', '"pan"', '"dob"', 'monthlySalaryPaise']) assert.equal(JSON.stringify(detail).includes(privateField), false, privateField);
});

test('Disbursement scope hides applied/rejected loans and only one concurrent release can succeed', async () => {
  const applied = await submitted('Applied only');
  await request(app).get(`/api/v1/disbursement/loans/${applied.loan.id}`).set('Cookie', staff.DISBURSEMENT).expect(404);
  await disburse(applied.loan.id, staff.DISBURSEMENT).expect(409);
  const sanctioned = await submitted('Ready for release');
  await decide(sanctioned.loan.id, staff.SANCTION, { decision: 'APPROVE' }).expect(200);
  const results = await Promise.all([disburse(sanctioned.loan.id, staff.DISBURSEMENT), disburse(sanctioned.loan.id, staff.ADMIN)]);
  assert.equal(results.filter((response) => response.status === 200).length, 1); assert.equal(results.filter((response) => response.status === 409).length, 1);
  const released = loanDetailResponseSchema.parse(results.find((response) => response.status === 200)!.body).data;
  assert.equal(released.status, 'DISBURSED'); assert.ok(released.disbursedAt); assert.equal(released.statusHistory.length, 3);
  assert.equal(released.statusHistory.at(-1)!.fromStatus, 'SANCTIONED'); assert.equal(released.statusHistory.at(-1)!.toStatus, 'DISBURSED'); assert.ok(['DISBURSEMENT', 'ADMIN'].includes(released.statusHistory.at(-1)!.actorRole));
  const history = disbursementLoanPageSchema.parse((await request(app).get('/api/v1/disbursement/loans?status=DISBURSED').set('Cookie', staff.DISBURSEMENT).expect(200)).body);
  assert.equal(history.pagination.total, 1); assert.equal(history.data[0]!.id, sanctioned.loan.id);
  await request(app).get('/api/v1/disbursement/loans?status=APPLIED').set('Cookie', staff.DISBURSEMENT).expect(422);
});

test('Step 7 routes enforce role, syntax, strict body, and history boundaries', async () => {
  const fixture = await submitted();
  await request(app).get('/api/v1/sanction/loans').expect(401);
  await request(app).get('/api/v1/sanction/loans').set('Cookie', staff.DISBURSEMENT).expect(403);
  await request(app).get('/api/v1/disbursement/loans').set('Cookie', staff.SANCTION).expect(403);
  await request(app).get('/api/v1/sanction/loans/invalid').set('Cookie', staff.SANCTION).expect(400);
  await decide(fixture.loan.id, staff.SANCTION, { decision: 'APPROVE', reason: 'forged' }).expect(422);
  await decide(fixture.loan.id, staff.SANCTION, { decision: 'REJECT', reason: '' }).expect(422);
  await request(app).post(`/api/v1/disbursement/loans/${fixture.loan.id}/disburse`).set(headers).set('Cookie', staff.DISBURSEMENT).send({ status: 'DISBURSED' }).expect(422);
  await request(app).post(`/api/v1/disbursement/loans/${fixture.loan.id}/disburse`).set(headers).set('Cookie', staff.DISBURSEMENT).query({ extra: 'forged' }).send({}).expect(422);
  await decide(fixture.loan.id, staff.ADMIN, { decision: 'APPROVE' }).expect(200);
  await request(app).get(`/api/v1/sanction/loans/${fixture.loan.id}`).set('Cookie', staff.ADMIN).expect(200);
  await request(app).get(`/api/v1/disbursement/loans/${fixture.loan.id}`).set('Cookie', staff.ADMIN).expect(200);
});

for (const role of ['BORROWER', 'ADMIN', 'SALES', 'SANCTION', 'DISBURSEMENT', 'COLLECTION'] as const) {
  test(`${role}: real module reads and writes enforce the complete lifecycle role matrix`, async () => {
    const fixture = await submitted(`Role matrix ${role}`);
    const cookie = role === 'BORROWER' ? fixture.cookie : staff[role];
    const allowed = (moduleRole: Role) => role === 'ADMIN' || role === moduleRole;
    const lead = await User.create({ email: `step10-lead-${randomUUID()}@example.test`, role: 'BORROWER', passwordHash: 'unused' });
    for (const path of ['/sales/leads', `/sales/leads/${lead.id}`]) {
      await request(app).get(`/api/v1${path}`).set('Cookie', cookie).expect(allowed('SALES') ? 200 : 403);
    }
    await request(app).post(`/api/v1/sales/leads/${lead.id}`).set(headers).set('Cookie', cookie).send({}).expect(allowed('SALES') ? 404 : 403);
    for (const path of ['/sanction/loans', `/sanction/loans/${fixture.loan.id}`]) {
      await request(app).get(`/api/v1${path}`).set('Cookie', cookie).expect(allowed('SANCTION') ? 200 : 403);
    }
    await decide(fixture.loan.id, cookie, { decision: 'APPROVE' }).expect(allowed('SANCTION') ? 200 : 403);
    if (!allowed('SANCTION')) {
      assert.equal((await Loan.findById(fixture.loan.id).orFail()).status, 'APPLIED');
      await decide(fixture.loan.id, staff.ADMIN, { decision: 'APPROVE' }).expect(200);
    }
    for (const path of ['/disbursement/loans', `/disbursement/loans/${fixture.loan.id}`]) {
      await request(app).get(`/api/v1${path}`).set('Cookie', cookie).expect(allowed('DISBURSEMENT') ? 200 : 403);
    }
    await disburse(fixture.loan.id, cookie).expect(allowed('DISBURSEMENT') ? 200 : 403);
    if (!allowed('DISBURSEMENT')) {
      assert.equal((await Loan.findById(fixture.loan.id).orFail()).status, 'SANCTIONED');
      await disburse(fixture.loan.id, staff.ADMIN).expect(200);
    }
    for (const path of ['/collection/loans', `/collection/loans/${fixture.loan.id}`, `/collection/loans/${fixture.loan.id}/payments`]) {
      await request(app).get(`/api/v1${path}`).set('Cookie', cookie).expect(allowed('COLLECTION') ? 200 : 403);
    }
    const payment = { utr: `STEP10-${role}`, amountPaise: fixture.loan.totalRepaymentPaise, paymentDate: indiaDate(new Date()) };
    await request(app).post(`/api/v1/collection/loans/${fixture.loan.id}/payments`).set(headers).set('Cookie', cookie).send(payment).expect(allowed('COLLECTION') ? 201 : 403);
    assert.equal(await Payment.countDocuments({ loanId: fixture.loan.id }), allowed('COLLECTION') ? 1 : 0);
    const stored = await Loan.findById(fixture.loan.id).orFail();
    assert.equal(stored.status, allowed('COLLECTION') ? 'CLOSED' : 'DISBURSED');
    assert.equal(stored.totalPaidPaise, allowed('COLLECTION') ? fixture.loan.totalRepaymentPaise : 0);
    for (const suffix of ['', '/payments']) {
      await request(app).get(`/api/v1/borrower/loans/${fixture.loan.id}${suffix}`).set('Cookie', cookie).expect(role === 'BORROWER' ? 200 : 403);
    }
  });
}
