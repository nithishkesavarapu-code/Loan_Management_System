import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer, request as httpRequest } from 'node:http';
import { readdir, readFile, rmdir, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { before, after, test, mock } from 'node:test';
import { setTimeout } from 'node:timers/promises';
import mongoose, { Types } from 'mongoose';
import request from 'supertest';
import { documentResponseSchema, salarySlipMaxBytes, type Role } from '@lms/shared';
import { createApp } from '../../src/app.js';
import { parseEnvironment } from '../../src/config/env.js';
import { connectDatabase, disconnectDatabase } from '../../src/config/database.js';
import { ensureIndexes } from '../../src/models/indexes.js';
import { User } from '../../src/modules/auth/user.model.js';
import { createSession } from '../../src/modules/auth/session.js';
import { Application } from '../../src/modules/applications/application.model.js';
import { Document } from '../../src/modules/documents/document.model.js';
import { Loan } from '../../src/modules/loans/loan.model.js';
import { DocumentStorage } from '../../src/modules/documents/document.storage.js';
import { evaluateEligibility } from '../../src/modules/applications/eligibility.js';
import { HttpError } from '../../src/middleware/errors.js';
import { pdf, png, jpeg, sizedPdf } from '../document-fixtures.js';

const dbName = `lms_step5_test_${randomUUID().replaceAll('-', '')}`;
const uri = new URL(process.env.MONGODB_URI!); uri.pathname = `/${dbName}`;
const env = parseEnvironment({ ...process.env, NODE_ENV: 'test', MONGODB_URI: uri.toString(), UPLOAD_DIR: `.cache/${dbName}`, JWT_SECRET: 'isolated-step5-test-secret-not-for-the-application' });
const app = createApp(env);
const storage = new DocumentStorage(env.UPLOAD_DIR);
const headers = { Origin: env.WEB_ORIGIN, 'X-LMS-Request': '1' };
const cookies = {} as Record<Role | 'FOREIGN', string>;
let ownerId: string;
let applicationId: string;
const valid = { fullName: 'Synthetic Upload Borrower', pan: 'ABCDE1234F', dob: '1995-06-15', monthlySalaryPaise: 2_500_000, employmentMode: 'SELF_EMPLOYED' as const };
before(async () => {
  await connectDatabase(env); await ensureIndexes(); await storage.prepare();
  for (const name of ['BORROWER', 'FOREIGN', 'ADMIN', 'SALES', 'SANCTION', 'DISBURSEMENT', 'COLLECTION'] as const) {
    const user = await User.create({ email: `${name.toLowerCase()}@example.test`, role: name === 'FOREIGN' ? 'BORROWER' : name, passwordHash: 'unused-synthetic-test-account' });
    cookies[name] = `lms_session=${await createSession(user.id, env)}`;
    if (name === 'BORROWER') ownerId = user.id;
  }
  applicationId = (await Application.create({ borrowerId: ownerId, personalDetails: valid })).id;
});
after(async () => {
  try {
    assert.match(dbName, /^lms_step5_test_[a-f0-9]{32}$/);
    assert.equal(storage.root, resolve(storage.root, '..', dbName));
    for (const key of await readdir(storage.root)) await storage.remove(key);
    await rmdir(storage.root);
    if (mongoose.connection.readyState === 1) { assert.equal(mongoose.connection.name, dbName); await mongoose.connection.dropDatabase(); }
  } finally { await disconnectDatabase(); }
});
function upload(buffer = pdf, name = 'synthetic.pdf', type = 'application/pdf', cookie = cookies.BORROWER, id = applicationId) {
  return request(app).post(`/api/v1/borrower/applications/${id}/salary-slip`).set(headers).set('Cookie', cookie).attach('file', buffer, { filename: name, contentType: type });
}
function download(id: string, cookie = cookies.BORROWER) { return request(app).get(`/api/v1/documents/${id}`).set('Cookie', cookie); }
async function assertClean() {
  const documents = await Document.find();
  assert.deepEqual((await readdir(storage.root)).sort(), documents.map((doc) => doc.storageKey).sort());
}
test('PDF, JPG, JPEG and PNG upload with private DTOs, exact download bytes, safe headers and current links', async () => {
  for (const [bytes, filename, mimeType] of [[pdf, 'synthetic.pdf', 'application/pdf'], [jpeg, 'synthetic.jpg', 'image/jpeg'], [jpeg, 'synthetic.JPEG', 'image/jpeg'], [png, 'synthetic.png', 'image/png']] as const) {
    const data = documentResponseSchema.parse((await upload(bytes, filename, mimeType).expect(201)).body).data;
    assert.equal(data.sizeBytes, bytes.length); assert.equal(data.mimeType, mimeType); assert.equal(data.originalName, filename);
    const record = await Document.findById(data.id).orFail();
    assert.notEqual(record.storageKey, filename); assert.deepEqual(await readFile(storage.path(record.storageKey)), bytes);
    const response = await download(data.id).expect(200);
    assert.deepEqual(response.body, bytes); assert.equal(response.headers['content-type'], mimeType);
    assert.equal(response.headers['cache-control'], 'no-store'); assert.equal(response.headers['x-content-type-options'], 'nosniff'); assert.match(response.headers['content-disposition']!, /^attachment;/);
    const application = await request(app).get(`/api/v1/borrower/applications/${applicationId}`).set('Cookie', cookies.BORROWER).expect(200);
    assert.equal(application.body.data.salarySlip.id, data.id); assert.equal(application.body.data.nextStep, 'LOAN_CONFIGURATION');
    assert.equal(await Document.countDocuments(), 1); await assertClean();
  }
});
test('inclusive 5,000,000 content bytes succeed; one extra byte fails and preserves the current file', async () => {
  const exact = documentResponseSchema.parse((await upload(sizedPdf(salarySlipMaxBytes)).expect(201)).body).data;
  assert.equal(exact.sizeBytes, salarySlipMaxBytes);
  const response = await upload(sizedPdf(salarySlipMaxBytes + 1)).expect(413);
  assert.equal(response.body.error.code, 'FILE_TOO_LARGE');
  assert.equal((await Application.findById(applicationId).orFail()).salarySlipId?.toHexString(), exact.id);
  assert.equal((await download(exact.id).expect(200)).body.length, salarySlipMaxBytes); await assertClean();
});
test('missing, empty, extra, malformed and disguised uploads are rejected without temporary files', async () => {
  await request(app).post(`/api/v1/borrower/applications/${applicationId}/salary-slip`).set(headers).set('Cookie', cookies.BORROWER).expect(422);
  await upload(Buffer.alloc(0)).expect(422);
  for (const [buffer, name, mime] of [[Buffer.from('not a PDF'), 'fake.pdf', 'application/pdf'], [pdf, 'fake.png', 'image/png'], [pdf, 'fake.jpg', 'application/pdf'], [pdf, 'fake.pdf', 'image/png'], [png, 'bad.exe', 'image/png'], [Buffer.from('GIF89a'), 'bad.gif', 'image/gif']] as const) await upload(buffer, name, mime).expect(415);
  await upload().attach('file', pdf, 'extra.pdf').expect(422);
  await upload().field('borrowerId', ownerId).expect(422);
  await request(app).post(`/api/v1/borrower/applications/${applicationId}/salary-slip`).set(headers).set('Cookie', cookies.BORROWER).attach('wrong', pdf, 'test.pdf').expect(422);
  await request(app).post(`/api/v1/borrower/applications/${applicationId}/salary-slip`).set(headers).set('Cookie', cookies.BORROWER).set('Content-Type', 'multipart/form-data; boundary=bad').send('--bad\r\nContent-Disposition: form-data; name="file"; filename="bad.pdf"\r\nContent-Type: application/pdf\r\n\r\n%PDF-1.4').expect(422);
  await assertClean();
});
test('auth, origin, role, ownership, eligibility and strict requests are enforced before uploads', async () => {
  await upload(pdf, 'test.pdf', 'application/pdf', '').expect(401);
  await upload().unset('Origin').expect(403);
  await upload().unset('X-LMS-Request').expect(403);
  await upload(pdf, 'test.pdf', 'application/pdf', cookies.FOREIGN).expect(404);
  await upload(pdf, 'test.pdf', 'application/pdf', cookies.BORROWER, 'bad-id').expect(400);
  await upload().query({ extra: true }).expect(422);
  for (const role of ['ADMIN', 'SALES', 'SANCTION', 'DISBURSEMENT', 'COLLECTION'] as const) await upload(pdf, 'test.pdf', 'application/pdf', cookies[role]).expect(403);
  await Application.updateOne({ _id: applicationId }, { $set: { 'personalDetails.monthlySalaryPaise': 1 } });
  const response = await upload().expect(422); assert.equal(response.body.error.code, 'BRE_FAILED');
  await Application.updateOne({ _id: applicationId }, { $set: { personalDetails: valid } });
  await assertClean();
});
test('draft documents are private to their owner; superseded and unavailable IDs do not disclose bytes', async () => {
  const old = documentResponseSchema.parse((await upload().expect(201)).body).data;
  for (const role of ['FOREIGN', 'SANCTION', 'ADMIN'] as const) await download(old.id, cookies[role]).expect(404);
  for (const role of ['SALES', 'DISBURSEMENT', 'COLLECTION'] as const) await download(old.id, cookies[role]).expect(403);
  await download(old.id, '').expect(401);
  await download('bad-id').expect(400); await download(new Types.ObjectId().toHexString()).expect(404);
  await download(old.id).query({ extra: true }).expect(422); await download(old.id).send({ extra: true }).expect(400);
  await upload().expect(201); await download(old.id).expect(404);
  assert.equal(await Document.exists({ _id: old.id }), null); await assertClean();
});
test('concurrent replacements serialize and leave exactly one current, downloadable file', async () => {
  const results = await Promise.all(Array.from({ length: 4 }, (_, index) => upload(pdf, `concurrent-${index}.pdf`).expect(201)));
  const application = await Application.findById(applicationId).orFail();
  const current = application.salarySlipId!.toHexString();
  for (const response of results) await download(response.body.data.id).expect(response.body.data.id === current ? 200 : 404);
  assert.equal(await Document.countDocuments(), 1); await assertClean();
});
test('failed transactions roll back new metadata and bytes while retaining the previous document', async () => {
  const old = (await Application.findById(applicationId).orFail()).salarySlipId!.toHexString();
  const fault = mock.method(Application, 'updateOne', () => { throw new HttpError(503, 'TEST_FAILURE', 'Synthetic database failure.'); });
  try { await upload().expect(503); } finally { fault.mock.restore(); }
  assert.equal(await Document.countDocuments(), 1); await download(old).expect(200); await assertClean();
});
test('an uncertain commit retains unconfirmed bytes for reconciliation rather than deleting them', async () => {
  const existing = new Set(await readdir(storage.root));
  const failure = new mongoose.mongo.MongoServerError({ message: 'Synthetic unknown commit outcome.' });
  failure.addErrorLabel('UnknownTransactionCommitResult');
  const fault = mock.method(mongoose.connection, 'transaction', async () => { throw failure; });
  try { await upload().expect(500); } finally { fault.mock.restore(); }
  const retained = (await readdir(storage.root)).filter((key) => !existing.has(key));
  assert.equal(retained.length, 1); assert.ok(!retained[0]!.endsWith('.upload'));
  await storage.remove(retained[0]!); await assertClean();
});
test('unlinked metadata remains inaccessible and forged storage paths never reach the filesystem', async () => {
  const record = await Document.findOne().orFail();
  const orphan = await Document.create({ borrowerId: record.borrowerId, applicationId: record.applicationId, storageKey: `${randomUUID()}.pdf`, originalName: 'unlinked.pdf', detectedMimeType: 'application/pdf', sizeBytes: pdf.length });
  try {
    for (const role of ['BORROWER', 'SANCTION', 'ADMIN'] as const) await download(orphan.id, cookies[role]).expect(404);
  } finally { await Document.deleteOne({ _id: orphan._id }); }
  await Document.collection.updateOne({ _id: record._id }, { $set: { storageKey: '../../.env' } });
  try { await download(record.id).expect(503); }
  finally { await Document.collection.updateOne({ _id: record._id }, { $set: { storageKey: record.storageKey } }); }
  await assertClean();
});
test('missing or corrupted private bytes return a safe 503 only after authorization', async () => {
  const data = documentResponseSchema.parse((await upload().expect(201)).body).data;
  const record = await Document.findById(data.id).orFail();
  await storage.remove(record.storageKey);
  const response = await download(data.id).expect(503); assert.equal(response.body.error.code, 'DOCUMENT_UNAVAILABLE');
  assert.equal(JSON.stringify(response.body).includes(storage.root), false);
  await download(data.id, cookies.FOREIGN).expect(404);
  await writeFile(storage.path(record.storageKey), 'corrupt', { flag: 'wx' });
  await download(data.id).expect(503);
  await upload().expect(201); await assertClean();
});

async function slowUpload(change: () => Promise<void>, abort = false) {
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const boundary = 'step5-slow-boundary';
  let finish!: (result: { status: number; body: string }) => void;
  const completed = new Promise<{ status: number; body: string }>((resolve) => { finish = resolve; });
  const req = httpRequest({ hostname: '127.0.0.1', port: address.port, method: 'POST', path: `/api/v1/borrower/applications/${applicationId}/salary-slip`, headers: { ...headers, Cookie: cookies.BORROWER, 'Content-Type': `multipart/form-data; boundary=${boundary}` } }, (res) => {
    let body = ''; res.on('data', (chunk) => { body += String(chunk); }); res.on('end', () => finish({ status: res.statusCode!, body }));
  });
  req.on('error', () => finish({ status: 0, body: '' }));
  try {
    req.write(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="slow.pdf"\r\nContent-Type: application/pdf\r\n\r\n`);
    req.write(pdf.subarray(0, 8));
    for (let attempt = 0; attempt < 100 && !(await readdir(storage.root)).some((key) => key.endsWith('.upload')); attempt++) await setTimeout(20);
    assert.ok((await readdir(storage.root)).some((key) => key.endsWith('.upload')), 'initial authorization completed and file bytes started');
    await change();
    if (abort) req.destroy(); else { req.write(pdf.subarray(8)); req.end(`\r\n--${boundary}--\r\n`); }
    const response = await completed;
    for (let attempt = 0; attempt < 100 && (await readdir(storage.root)).some((key) => key.endsWith('.upload')); attempt++) await setTimeout(20);
    return response;
  } finally { req.destroy(); server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); }
}
test('eligibility and DRAFT state are rechecked after slow uploads; aborted uploads clean up', async () => {
  const old = (await Application.findById(applicationId).orFail()).salarySlipId!.toHexString();
  const ineligible = await slowUpload(async () => { await Application.updateOne({ _id: applicationId }, { $set: { 'personalDetails.monthlySalaryPaise': 1 } }); });
  assert.equal(ineligible.status, 422); assert.equal(JSON.parse(ineligible.body).error.code, 'BRE_FAILED'); await assertClean();
  await Application.updateOne({ _id: applicationId }, { $set: { personalDetails: valid } });
  const submitted = await slowUpload(async () => { await Application.updateOne({ _id: applicationId }, { $set: { state: 'SUBMITTED' } }); });
  assert.equal(submitted.status, 409); await assertClean();
  await Application.updateOne({ _id: applicationId }, { $set: { state: 'DRAFT' } });
  await slowUpload(async () => {}, true); await assertClean();
  assert.equal((await Application.findById(applicationId).orFail()).salarySlipId!.toHexString(), old);
});
test('Sanction and Admin download only matching submitted-loan documents; submitted bytes cannot be replaced', async () => {
  const data = documentResponseSchema.parse((await upload(pdf, 'salary"report.pdf').expect(201)).body).data;
  assert.equal(data.originalName, 'salary_report.pdf');
  const eligibility = evaluateEligibility(valid, new Date());
  await Application.updateOne({ _id: applicationId }, { $set: { state: 'SUBMITTED', submittedAt: new Date(), eligibilityAtSubmission: eligibility } });
  const loan = await Loan.create({ borrowerId: ownerId, applicationId, salarySlipId: data.id, applicantSnapshot: { ...valid, email: 'borrower@example.test' }, eligibilityAtSubmission: eligibility, principalPaise: 5_000_000, tenureDays: 365, annualRatePercent: 12, interestPaise: 600_000, totalRepaymentPaise: 5_600_000, status: 'APPLIED', statusHistory: [{ toStatus: 'APPLIED', actorId: ownerId, actorRole: 'BORROWER', occurredAt: new Date() }] });
  for (const role of ['BORROWER', 'SANCTION', 'ADMIN'] as const) assert.deepEqual((await download(data.id, cookies[role]).expect(200)).body, pdf);
  for (const role of ['SALES', 'DISBURSEMENT', 'COLLECTION'] as const) await download(data.id, cookies[role]).expect(403);
  await download(data.id, cookies.FOREIGN).expect(404); await upload().expect(409);
  await Application.updateOne({ _id: applicationId }, { $set: { state: 'DRAFT' } });
  await upload().expect(409);
  await Loan.collection.updateOne({ _id: loan._id }, { $set: { borrowerId: new Types.ObjectId() } });
  await download(data.id, cookies.SANCTION).expect(404);
  await Loan.collection.updateOne({ _id: loan._id }, { $set: { borrowerId: new Types.ObjectId(ownerId), applicationId: new Types.ObjectId() } });
  await download(data.id, cookies.ADMIN).expect(404);
  await Loan.deleteOne({ _id: loan._id }); await assertClean();
});
test('unwritable storage fails without metadata or path leakage', async () => {
  const blockedPath = resolve(storage.root, 'blocked');
  await writeFile(blockedPath, 'synthetic obstruction', { flag: 'wx' });
  try {
    const blockedApp = createApp({ ...env, UPLOAD_DIR: blockedPath });
    const response = await request(blockedApp).post(`/api/v1/borrower/applications/${applicationId}/salary-slip`).set(headers).set('Cookie', cookies.BORROWER).attach('file', pdf, 'synthetic.pdf').expect(503);
    assert.equal(response.body.error.code, 'DOCUMENT_UNAVAILABLE'); assert.equal(JSON.stringify(response.body).includes(blockedPath), false);
  } finally { await unlink(blockedPath); }
  await assertClean();
});
