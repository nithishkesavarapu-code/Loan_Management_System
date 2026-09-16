import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectionLoanListQuerySchema, paymentListQuerySchema, recordPaymentSchema } from '@lms/shared';

test('payment inputs normalize UTRs and reject invalid amounts, dates and injected fields', () => {
  const valid = { utr: '  transfer-01  ', amountPaise: 1, paymentDate: '2024-02-29' };
  assert.equal(recordPaymentSchema.parse(valid).utr, 'TRANSFER-01');
  for (const amountPaise of [0, -1, 0.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1, '100']) {
    assert.equal(recordPaymentSchema.safeParse({ ...valid, amountPaise }).success, false);
  }
  for (const utr of ['', '   ', 'A'.repeat(101), 'HAS SPACE', 'A/B', {}]) assert.equal(recordPaymentSchema.safeParse({ ...valid, utr }).success, false);
  for (const paymentDate of ['2025-02-29', '2026-04-31', '2026-9-01', '2026-09-01T00:00:00Z']) assert.equal(recordPaymentSchema.safeParse({ ...valid, paymentDate }).success, false);
  for (const extra of [{ recordedBy: 'a'.repeat(24) }, { loanId: 'a'.repeat(24) }, { totalPaidPaise: 1 }, { status: 'CLOSED' }]) assert.equal(recordPaymentSchema.safeParse({ ...valid, ...extra }).success, false);
});

test('collection history and ledger queries are strict, scoped and paginated', () => {
  assert.deepEqual(collectionLoanListQuerySchema.parse({}), { page: 1, limit: 20, status: 'DISBURSED' });
  assert.equal(collectionLoanListQuerySchema.parse({ status: 'CLOSED', q: '  Ada  ' }).q, 'Ada');
  for (const status of ['APPLIED', 'SANCTIONED', 'REJECTED']) assert.equal(collectionLoanListQuerySchema.safeParse({ status }).success, false);
  for (const query of [{ limit: '101' }, { page: '0' }, { page: ['1', '2'] }, { sort: 'amount' }, { q: 'UTR' }]) assert.equal(paymentListQuerySchema.safeParse(query).success, false);
});
