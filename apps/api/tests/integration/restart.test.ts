import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { readdir, rmdir } from 'node:fs/promises';
import { createServer } from 'node:net';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import request from 'supertest';
import { indiaDate, paymentPageSchema, recordPaymentResponseSchema, reviewedLoanResponseSchema } from '@lms/shared';
import { connectDatabase, disconnectDatabase } from '../../src/config/database.js';
import { parseEnvironment } from '../../src/config/env.js';
import { createSession } from '../../src/modules/auth/session.js';
import { User } from '../../src/modules/auth/user.model.js';
import { DocumentStorage } from '../../src/modules/documents/document.storage.js';
import { pdf } from '../document-fixtures.js';

test('real API restarts preserve sessions, frozen loans, document bytes, partial payments and closure', { timeout: 120000 }, async () => {
  const dbName = `lms_step10_restart_${randomUUID().replaceAll('-', '')}`;
  const uri = new URL(process.env.MONGODB_URI!); uri.pathname = `/${dbName}`;
  const socket = createServer();
  socket.listen(0, '127.0.0.1'); await once(socket, 'listening');
  const address = socket.address(); assert.ok(address && typeof address !== 'string');
  const port = address.port;
  await new Promise<void>((resolve, reject) => socket.close((error) => error ? reject(error) : resolve()));
  const childEnv = { ...process.env, NODE_ENV: 'test', API_HOST: '127.0.0.1', API_PORT: String(port), MONGODB_URI: uri.toString(), UPLOAD_DIR: `.cache/${dbName}`, JWT_SECRET: 'isolated-step10-restart-test-secret-not-the-application', COOKIE_SECURE: 'false' };
  const env = parseEnvironment(childEnv);
  const storage = new DocumentStorage(env.UPLOAD_DIR);
  const headers = { Origin: env.WEB_ORIGIN, 'X-LMS-Request': '1' };
  const base = `http://127.0.0.1:${port}`;
  let child: ChildProcess | undefined;
  async function start() {
    child = spawn(process.execPath, ['--import', 'tsx', 'src/server.ts'], { cwd: fileURLToPath(new URL('../../', import.meta.url)), env: childEnv, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const processHandle = child;
    await new Promise<void>((resolve, reject) => {
      let output = '';
      const timeout = setTimeout(() => finish(new Error('Isolated API startup timed out.')), 20000);
      function finish(error?: Error) { clearTimeout(timeout); processHandle.removeListener('error', failed); processHandle.removeListener('exit', exited); if (error) reject(error); else resolve(); }
      function failed(error: Error) { finish(error); }
      function exited() { finish(new Error(`Isolated API exited before readiness: ${output}`)); }
      processHandle.once('error', failed); processHandle.once('exit', exited);
      processHandle.stderr!.on('data', (chunk: Buffer) => { output += chunk.toString(); });
      processHandle.stdout!.on('data', (chunk: Buffer) => { if (chunk.toString().includes('LMS API ready at')) finish(); });
    });
  }
  async function stop() {
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, 'exit');
    child.kill();
    await exited;
    child = undefined;
  }
  try {
    await connectDatabase(env); await storage.prepare(); await start();
    const admin = await User.create({ email: 'restart-admin@example.test', role: 'ADMIN', passwordHash: 'unused' });
    const adminCookie = `lms_session=${await createSession(admin.id, env)}`;
    const borrower = request.agent(base);
    await borrower.post('/api/v1/auth/register').set(headers).send({ email: 'restart-borrower@example.test', password: 'RestartTest!2026' }).expect(201);
    const created = await borrower.post('/api/v1/borrower/applications').set(headers).send({}).expect(201);
    const applicationId = created.body.data.id as string;
    await borrower.patch(`/api/v1/borrower/applications/${applicationId}`).set(headers).send({ personalDetails: { fullName: 'Restart Persistence', pan: 'ABCDE1234F', dob: '1995-06-15', monthlySalaryPaise: 2_500_000, employmentMode: 'SALARIED' }, loanConfig: { principalPaise: 10_000_000, tenureDays: 365 } }).expect(200);
    await borrower.post(`/api/v1/borrower/applications/${applicationId}/salary-slip`).set(headers).attach('file', pdf, { filename: 'restart.pdf', contentType: 'application/pdf' }).expect(201);
    const submitted = reviewedLoanResponseSchema.parse((await borrower.post(`/api/v1/borrower/applications/${applicationId}/submit`).set(headers).send({}).expect(201)).body).data;
    const id = submitted.id;
    await request(base).post(`/api/v1/sanction/loans/${id}/decision`).set(headers).set('Cookie', adminCookie).send({ decision: 'APPROVE' }).expect(200);
    await request(base).post(`/api/v1/disbursement/loans/${id}/disburse`).set(headers).set('Cookie', adminCookie).send({}).expect(200);
    const partialBody = { utr: 'RESTART-PARTIAL', amountPaise: 4_000_000, paymentDate: indiaDate(new Date()) };
    await request(base).post(`/api/v1/collection/loans/${id}/payments`).set(headers).set('Cookie', adminCookie).send(partialBody).expect(201);
    await stop(); await start();
    await borrower.get('/api/v1/auth/me').expect(200);
    const persisted = reviewedLoanResponseSchema.parse((await borrower.get(`/api/v1/borrower/loans/${id}`).expect(200)).body).data;
    assert.equal(persisted.status, 'DISBURSED'); assert.equal(persisted.totalPaidPaise, 4_000_000); assert.equal(persisted.outstandingPaise, 7_200_000);
    assert.deepEqual(persisted.applicantSnapshot, submitted.applicantSnapshot);
    assert.deepEqual(persisted.salarySlip, submitted.salarySlip);
    const download = await borrower.get(`/api/v1/documents/${submitted.salarySlip.id}`).expect(200);
    assert.deepEqual(download.body, pdf);
    await request(base).post(`/api/v1/collection/loans/${id}/payments`).set(headers).set('Cookie', adminCookie).send(partialBody).expect(409);
    const closed = recordPaymentResponseSchema.parse((await request(base).post(`/api/v1/collection/loans/${id}/payments`).set(headers).set('Cookie', adminCookie).send({ utr: 'RESTART-FINAL', amountPaise: persisted.outstandingPaise, paymentDate: indiaDate(new Date()) }).expect(201)).body).data;
    assert.equal(closed.loan.status, 'CLOSED');
    await stop(); await start();
    const final = reviewedLoanResponseSchema.parse((await borrower.get(`/api/v1/borrower/loans/${id}`).expect(200)).body).data;
    assert.equal(final.status, 'CLOSED'); assert.equal(final.outstandingPaise, 0); assert.equal(final.statusHistory.filter((event) => event.toStatus === 'CLOSED').length, 1);
    const ledger = paymentPageSchema.parse((await borrower.get(`/api/v1/borrower/loans/${id}/payments`).expect(200)).body);
    assert.equal(ledger.pagination.total, 2);
    assert.equal(ledger.data.reduce((total, payment) => total + payment.amountPaise, 0), final.totalRepaymentPaise);
    const sales = await request(base).get('/api/v1/sales/leads?q=restart-borrower').set('Cookie', adminCookie).expect(200);
    assert.equal(sales.body.pagination.total, 0);
  } finally {
    await stop();
    try {
      assert.match(dbName, /^lms_step10_restart_[a-f0-9]{32}$/);
      for (const key of await readdir(storage.root).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return []; throw error; })) await storage.remove(key);
      await rmdir(storage.root).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; });
      if (mongoose.connection.readyState === 1) { assert.equal(mongoose.connection.name, dbName); await mongoose.connection.dropDatabase(); }
    } finally { await disconnectDatabase(); }
  }
});
