import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { before, after, test } from 'node:test';
import mongoose, { Types } from 'mongoose';
import request from 'supertest';
import { applicationPageSchema, applicationResponseSchema, eligibilityResponseSchema, leadPageSchema, leadResponseSchema } from '@lms/shared';
import { createApp } from '../../src/app.js';
import { parseEnvironment } from '../../src/config/env.js';
import { connectDatabase, disconnectDatabase } from '../../src/config/database.js';
import { ensureIndexes } from '../../src/models/indexes.js';
import { User } from '../../src/modules/auth/user.model.js';
import { Application } from '../../src/modules/applications/application.model.js';
import { Loan } from '../../src/modules/loans/loan.model.js';
import { createSession } from '../../src/modules/auth/session.js';
import { evaluateEligibility } from '../../src/modules/applications/eligibility.js';

const dbName = `lms_step4_test_${randomUUID().replaceAll('-', '')}`;
const uri = new URL(process.env.MONGODB_URI!); uri.pathname = `/${dbName}`;
const env = parseEnvironment({ ...process.env, NODE_ENV: 'test', MONGODB_URI: uri.toString(), JWT_SECRET: 'isolated-step4-test-secret-not-for-the-application' });
const app = createApp(env);
const headers = { Origin: env.WEB_ORIGIN, 'X-LMS-Request': '1' };
let borrower: string;
let foreign: string;
let sales: string;
let admin: string;
let borrowerId: string;
let foreignId: string;
let applicationId: string;
const valid = { fullName: 'Synthetic Test Borrower', pan: 'ABCDE1234F', dob: '1995-06-15', monthlySalaryPaise: 2_500_000, employmentMode: 'SALARIED' as const };
before(async () => {
  await connectDatabase(env); await ensureIndexes();
  for (const [email, role] of [['owner@example.test', 'BORROWER'], ['foreign@example.test', 'BORROWER'], ['sales@example.test', 'SALES'], ['admin@example.test', 'ADMIN']] as const) {
    const user = await User.create({ email, role, passwordHash: 'not-used-by-this-session-test' });
    const cookie = `lms_session=${await createSession(user.id, env)}`;
    if (email.startsWith('owner')) { borrower = cookie; borrowerId = user.id; }
    else if (email.startsWith('foreign')) { foreign = cookie; foreignId = user.id; }
    else if (role === 'SALES') sales = cookie; else admin = cookie;
  }
});
after(async () => {
  try {
    assert.match(dbName, /^lms_step4_test_[a-f0-9]{32}$/);
    if (mongoose.connection.readyState === 1) { assert.equal(mongoose.connection.name, dbName); await mongoose.connection.dropDatabase(); }
  } finally { await disconnectDatabase(); }
});
function patch(body: object, cookie = borrower, id = applicationId) {
  return request(app).patch(`/api/v1/borrower/applications/${id}`).set(headers).set('Cookie', cookie).send(body);
}
test('a newly registered borrower appears in Sales without creating an application', async () => {
  const response = await request(app).get('/api/v1/sales/leads').set('Cookie', sales).expect(200);
  const result = leadPageSchema.parse(response.body);
  assert.equal(result.pagination.total, 2);
  const lead = result.data.find((lead) => lead.borrowerId === borrowerId)!;
  assert.equal(lead.fullName, null); assert.equal(lead.draftId, null); assert.equal(lead.eligible, null);
  const detail = await request(app).get(`/api/v1/sales/leads/${borrowerId}`).set('Cookie', admin).expect(200);
  assert.equal(leadResponseSchema.parse(detail.body).data.eligibility, null);
  assert.equal(await Application.countDocuments(), 0);
});
test('simultaneous draft starts create exactly one draft and resume without changing its timestamps', async () => {
  const results = await Promise.all(Array.from({ length: 8 }, () => request(app).post('/api/v1/borrower/applications').set(headers).set('Cookie', borrower).send({})));
  assert.equal(results.filter((response) => response.status === 201).length, 1);
  assert.equal(results.filter((response) => response.status === 200).length, 7);
  const records = results.map((response) => applicationResponseSchema.parse(response.body).data);
  applicationId = records[0]!.id;
  assert.equal(new Set(records.map((record) => record.id)).size, 1);
  assert.deepEqual(records[0]!.personalDetails, { fullName: null, pan: null, dob: null, monthlySalaryPaise: null, employmentMode: null });
  const before = await Application.findById(applicationId).orFail();
  await request(app).post('/api/v1/borrower/applications').set(headers).set('Cookie', borrower).expect(200);
  assert.equal((await Application.findById(applicationId).orFail()).updatedAt.toISOString(), before.updatedAt.toISOString());
});
test('partial updates merge supplied leaves, normalize values, preserve other fields and allow clearing', async () => {
  await patch({ personalDetails: { ...valid, fullName: '  Synthetic Test Borrower  ', pan: ' abcde1234f ' } }).expect(200);
  await Promise.all([patch({ personalDetails: { fullName: 'Edited Name' } }).expect(200), patch({ personalDetails: { employmentMode: 'SELF_EMPLOYED' } }).expect(200)]);
  const response = await request(app).get(`/api/v1/borrower/applications/${applicationId}`).set('Cookie', borrower).expect(200);
  const data = applicationResponseSchema.parse(response.body).data;
  assert.equal(data.personalDetails.fullName, 'Edited Name'); assert.equal(data.personalDetails.pan, 'ABCDE1234F'); assert.equal(data.personalDetails.employmentMode, 'SELF_EMPLOYED');
  assert.equal(data.eligibility.eligible, true); assert.equal(data.nextStep, 'SALARY_SLIP');
  const cleared = applicationResponseSchema.parse((await patch({ personalDetails: { fullName: null } }).expect(200)).body).data;
  assert.equal(cleared.personalDetails.fullName, null); assert.equal(cleared.personalDetails.pan, 'ABCDE1234F'); assert.equal(cleared.nextStep, 'PERSONAL_DETAILS');
});
test('failed BRE values persist, reevaluation is current, and a direct submission cannot bypass rules', async () => {
  const response = await patch({ personalDetails: { ...valid, pan: 'invalid-pan', monthlySalaryPaise: 2_499_999, employmentMode: 'UNEMPLOYED' } }).expect(200);
  assert.equal(response.body.data.eligibility.failures.length, 3);
  const attempt = await request(app).post(`/api/v1/borrower/applications/${applicationId}/submit`).set(headers).set('Cookie', borrower).send({}).expect(422);
  assert.equal(attempt.body.error.code, 'BRE_FAILED'); assert.ok(attempt.body.error.fields['personalDetails.monthlySalaryPaise']);
  await patch({ personalDetails: valid }).expect(200);
  const evaluated = await request(app).post(`/api/v1/borrower/applications/${applicationId}/eligibility`).set(headers).set('Cookie', borrower).expect(200);
  assert.equal(eligibilityResponseSchema.parse(evaluated.body).data.eligible, true);
  const missingSlip = await request(app).post(`/api/v1/borrower/applications/${applicationId}/submit`).set(headers).set('Cookie', borrower).expect(422);
  assert.equal(missingSlip.body.error.code, 'SALARY_SLIP_REQUIRED');
  await patch({ personalDetails: { monthlySalaryPaise: 1 } }).expect(200);
  const changed = await request(app).get(`/api/v1/borrower/applications/${applicationId}`).set('Cookie', borrower).expect(200);
  assert.equal(changed.body.data.eligibility.eligible, false); assert.equal(changed.body.data.nextStep, 'PERSONAL_DETAILS');
  await request(app).post(`/api/v1/borrower/applications/${applicationId}/submit`).set(headers).set('Cookie', borrower).expect(422);
  assert.equal(await Loan.countDocuments(), 0); assert.equal((await Application.findById(applicationId).orFail()).state, 'DRAFT');
});
test('invalid input, injected fields and unsupported content cannot change the draft', async () => {
  const original = await Application.findById(applicationId).lean();
  for (const body of [{}, { personalDetails: {} }, { personalDetails: null }, { personalDetails: { monthlySalaryPaise: '2500000' } },
    { personalDetails: { dob: '2025-02-29' } }, { personalDetails: { dob: '9999-01-01' } }, { personalDetails: { monthlySalaryPaise: -1 } },
    { borrowerId: foreignId }, { state: 'SUBMITTED' }, { eligible: true }, { salarySlipId: new Types.ObjectId().toHexString() }, { personalDetails: { extra: true } }]) {
    await patch(body).expect(422);
  }
  await request(app).patch(`/api/v1/borrower/applications/${applicationId}`).set(headers).set('Cookie', borrower).type('form').send({ fullName: 'Invalid encoding' }).expect(415);
  await request(app).post(`/api/v1/borrower/applications/${applicationId}/eligibility`).set(headers).set('Cookie', borrower).send({ eligible: true }).expect(422);
  await request(app).post(`/api/v1/borrower/applications/${applicationId}/submit`).set(headers).set('Cookie', borrower).send({ eligibility: { eligible: true } }).expect(422);
  assert.deepEqual(await Application.findById(applicationId).lean(), original);
});
test('read/write/evaluate/submit enforce ownership, malformed IDs, and every module role', async () => {
  for (const suffix of ['', '/eligibility', '/submit']) {
    if (!suffix) await request(app).get(`/api/v1/borrower/applications/${applicationId}`).set('Cookie', foreign).expect(404);
    else await request(app).post(`/api/v1/borrower/applications/${applicationId}${suffix}`).set(headers).set('Cookie', foreign).expect(404);
  }
  await patch({ personalDetails: valid }, foreign).expect(404);
  await patch({ personalDetails: valid }, borrower, 'not-an-id').expect(400);
  await patch({ personalDetails: valid }, borrower, new Types.ObjectId().toHexString()).expect(404);
  for (const role of ['ADMIN', 'SALES', 'SANCTION', 'DISBURSEMENT', 'COLLECTION'] as const) {
    const user = await User.create({ email: `${role.toLowerCase()}-matrix@example.test`, role, passwordHash: 'unused' });
    const cookie = `lms_session=${await createSession(user.id, env)}`;
    await request(app).get('/api/v1/borrower/applications').set('Cookie', cookie).expect(403);
    await patch({ personalDetails: valid }, cookie).expect(403);
    await request(app).post(`/api/v1/borrower/applications/${applicationId}/eligibility`).set(headers).set('Cookie', cookie).expect(403);
    await request(app).get('/api/v1/sales/leads').set('Cookie', cookie).expect(['ADMIN', 'SALES'].includes(role) ? 200 : 403);
    await request(app).get(`/api/v1/sales/leads/${borrowerId}`).set('Cookie', cookie).expect(['ADMIN', 'SALES'].includes(role) ? 200 : 403);
  }
  await request(app).get('/api/v1/sales/leads').set('Cookie', borrower).expect(403);
});
test('lists are owner-scoped, paginated, deterministic, strict and use literal name/email search', async () => {
  await patch({ personalDetails: { ...valid, fullName: 'Literal .* Borrower' } }).expect(200);
  const list = applicationPageSchema.parse((await request(app).get('/api/v1/borrower/applications?state=DRAFT&limit=1').set('Cookie', borrower).expect(200)).body);
  assert.equal(list.pagination.total, 1); assert.equal(list.data[0]?.borrowerId, borrowerId);
  const foreignList = await request(app).get('/api/v1/borrower/applications').set('Cookie', foreign).expect(200); assert.equal(foreignList.body.pagination.total, 0);
  const empty = await request(app).get('/api/v1/borrower/applications?page=9007199254740991&limit=100').set('Cookie', borrower).expect(200); assert.deepEqual(empty.body.data, []); assert.equal(empty.body.pagination.total, 1);
  for (const query of ['page=0', 'limit=101', 'page=1.5', 'q=forbidden', 'state=ALL', 'page=1&page=2']) {
    await request(app).get(`/api/v1/borrower/applications?${query}`).set('Cookie', borrower).expect(422);
  }
  for (const q of ['.*', 'LITERAL', 'OWNER@EXAMPLE']) {
    const result = leadPageSchema.parse((await request(app).get('/api/v1/sales/leads').query({ q }).set('Cookie', sales).expect(200)).body);
    assert.equal(result.pagination.total, 1); assert.equal(result.data[0]?.borrowerId, borrowerId);
  }
  for (const q of ['[', '$', 'no-such-name']) {
    const response = await request(app).get('/api/v1/sales/leads').query({ q }).set('Cookie', sales).expect(200); assert.equal(response.body.pagination.total, 0);
  }
  const one = leadPageSchema.parse((await request(app).get('/api/v1/sales/leads?limit=1').set('Cookie', sales).expect(200)).body);
  const two = leadPageSchema.parse((await request(app).get('/api/v1/sales/leads?limit=1&page=2').set('Cookie', sales).expect(200)).body);
  assert.equal(one.pagination.total, 2); assert.notEqual(one.data[0]?.borrowerId, two.data[0]?.borrowerId);
});
test('Sales DTOs expose progress but omit sensitive draft fields and internal MongoDB data', async () => {
  const result = leadResponseSchema.parse((await request(app).get(`/api/v1/sales/leads/${borrowerId}`).set('Cookie', sales).expect(200)).body).data;
  assert.equal(result.draftId, applicationId); assert.equal(result.eligible, true); assert.equal(result.nextStep, 'SALARY_SLIP');
  const json = JSON.stringify(result);
  for (const value of ['ABCDE1234F', '1995-06-15', '2500000', 'passwordHash', 'storageKey', 'personalDetails', 'salarySlipId', '"_id"', '"__v"']) assert.equal(json.includes(value), false, value);
});
test('submitted snapshots remain read-only and borrowers with any historical submission stay out of Sales', async () => {
  const eligibility = evaluateEligibility(valid, new Date('2026-09-15T06:00:00Z'));
  await Application.updateOne({ _id: applicationId }, { $set: { state: 'SUBMITTED', eligibilityAtSubmission: eligibility, submittedAt: new Date(), personalDetails: valid } });
  await patch({ personalDetails: { fullName: 'Must not change' } }).expect(409);
  await request(app).post(`/api/v1/borrower/applications/${applicationId}/eligibility`).set(headers).set('Cookie', borrower).expect(409);
  const read = applicationResponseSchema.parse((await request(app).get(`/api/v1/borrower/applications/${applicationId}`).set('Cookie', borrower).expect(200)).body).data;
  assert.equal(read.eligibility.evaluatedAt, eligibility.evaluatedAt); assert.equal(read.nextStep, 'SUBMITTED');
  await request(app).post('/api/v1/borrower/applications').set(headers).set('Cookie', borrower).expect(201);
  await request(app).get(`/api/v1/sales/leads/${borrowerId}`).set('Cookie', sales).expect(404);
  for (const status of ['REJECTED', 'CLOSED']) {
    const loan = await Loan.collection.insertOne({ borrowerId: new Types.ObjectId(foreignId), applicationId: new Types.ObjectId(), status });
    await request(app).get(`/api/v1/sales/leads/${foreignId}`).set('Cookie', sales).expect(404);
    await Loan.collection.deleteOne({ _id: loan.insertedId });
  }
  const final = await request(app).get('/api/v1/sales/leads').set('Cookie', sales).expect(200);
  assert.equal(final.body.pagination.total, 1); assert.equal(final.body.data[0].borrowerId, foreignId);
});
