import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Types } from 'mongoose';
import { Application } from '../src/modules/applications/application.model.js';
import { Payment } from '../src/modules/payments/payment.model.js';
import { Document } from '../src/modules/documents/document.model.js';
import { User } from '../src/modules/auth/user.model.js';

test('draft defaults match the contract and unknown fields cannot become model fields', async () => {
  const draft = new Application({ borrowerId: new Types.ObjectId() });
  await draft.validate();
  assert.equal(draft.state, 'DRAFT'); assert.equal(draft.principalPaise, 5_000_000); assert.equal(draft.tenureDays, 30);
  assert.deepEqual(draft.toObject().personalDetails, { fullName: null, pan: null, dob: null, monthlySalaryPaise: null, employmentMode: null });
  assert.throws(() => new Application({ borrowerId: new Types.ObjectId(), arbitrary: true }));
  draft.principalPaise = 5_000_000.5;
  await assert.rejects(draft.validate(), /principalPaise/);
});

test('payment metadata validates date-only values, integer paise and normalized UTR', async () => {
  const valid = { loanId: new Types.ObjectId(), recordedBy: new Types.ObjectId(), utrNormalized: ' test-utr ', amountPaise: 1, paymentDate: '2024-02-29' };
  const payment = new Payment(valid);
  await payment.validate(); assert.equal(payment.utrNormalized, 'TEST-UTR');
  for (const override of [{ amountPaise: 0 }, { amountPaise: 0.5 }, { amountPaise: Number.MAX_SAFE_INTEGER + 1 }, { paymentDate: '2025-02-29' }, { utrNormalized: 'bad utr' }]) {
    await assert.rejects(new Payment({ ...valid, ...override }).validate());
  }
});

test('user roles and document metadata are constrained', async () => {
  await assert.rejects(new User({ email: 'a@example.test', passwordHash: 'hash', role: 'SUPERADMIN' }).validate());
  const fields = { borrowerId: new Types.ObjectId(), applicationId: new Types.ObjectId(), storageKey: 'synthetic.pdf', originalName: 'synthetic.pdf', detectedMimeType: 'application/pdf', sizeBytes: 5_000_000 };
  await new Document(fields).validate();
  await assert.rejects(new Document({ ...fields, sizeBytes: 5_000_001 }).validate());
  await assert.rejects(new Document({ ...fields, detectedMimeType: 'text/html' }).validate());
});
