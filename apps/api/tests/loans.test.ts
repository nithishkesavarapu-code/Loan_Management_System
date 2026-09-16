import assert from 'node:assert/strict';
import { test } from 'node:test';
import { borrowerLoanListQuerySchema, calculateLoan, disbursementLoanListQuerySchema, formatINR, loanLimits, sanctionDecisionSchema, sanctionLoanListQuerySchema } from '@lms/shared';

test('loan calculations match the assignment examples and freeze the 12 percent rate', () => {
  assert.deepEqual(calculateLoan({ principalPaise: 5_000_000, tenureDays: 30 }), { principalPaise: 5_000_000, tenureDays: 30, annualRatePercent: 12, interestPaise: 49_315, totalRepaymentPaise: 5_049_315 });
  assert.equal(calculateLoan({ principalPaise: 10_000_000, tenureDays: 365 }).interestPaise, 1_200_000);
  assert.equal(calculateLoan({ principalPaise: 50_000_000, tenureDays: 365 }).totalRepaymentPaise, 56_000_000);
  assert.equal(calculateLoan({ principalPaise: 50_000_000, tenureDays: 30 }).interestPaise, 493_151);
});
test('interest rounds once to nearest paise for every permitted day and boundary/decimal principals', () => {
  for (let days = loanLimits.minTenureDays; days <= loanLimits.maxTenureDays; days++) {
    for (const principalPaise of [5_000_000, 5_000_001, 12_345_678, 49_999_999, 50_000_000]) {
      const result = calculateLoan({ principalPaise, tenureDays: days });
      const numerator = BigInt(principalPaise) * 12n * BigInt(days);
      const floor = numerator / 36_500n;
      assert.equal(result.interestPaise, Number(floor + (numerator % 36_500n >= 18_250n ? 1n : 0n)));
      assert.equal(result.totalRepaymentPaise, principalPaise + result.interestPaise);
    }
  }
});
test('invalid, fractional and unsafe loan terms cannot reach the calculator', () => {
  for (const principalPaise of [4_999_999, 50_000_001, 5_000_000.5, NaN, Infinity, Number.MAX_SAFE_INTEGER, -1]) assert.throws(() => calculateLoan({ principalPaise, tenureDays: 30 }));
  for (const tenureDays of [29, 366, 30.5, NaN, Infinity, 0]) assert.throws(() => calculateLoan({ principalPaise: 5_000_000, tenureDays }));
  assert.throws(() => calculateLoan({ principalPaise: 5_000_000, tenureDays: 30, annualRatePercent: 0 } as Parameters<typeof calculateLoan>[0]));
});
test('INR formatting retains exact fractional paise even at the safe-integer boundary', () => {
  assert.equal(formatINR(5_049_315).replaceAll('\u00a0', ' '), 'INR 50,493.15');
  assert.ok(formatINR(Number.MAX_SAFE_INTEGER).endsWith('.91'));
  assert.throws(() => formatINR(0.5)); assert.throws(() => formatINR(-1));
});
test('borrower loan filters allow only bounded pagination and known statuses', () => {
  assert.deepEqual(borrowerLoanListQuerySchema.parse({}), { page: 1, limit: 20, status: 'ALL' });
  assert.equal(borrowerLoanListQuerySchema.parse({ status: 'APPLIED' }).status, 'APPLIED');
  for (const query of [{ status: 'PENDING' }, { q: 'private' }, { borrowerId: 'other' }, { page: '0' }, { limit: '101' }, { page: '1.5' }, { status: ['ALL', 'APPLIED'] }]) assert.equal(borrowerLoanListQuerySchema.safeParse(query).success, false);
});
test('staff loan filters and decision payloads are strict and use only their permitted states', () => {
  assert.deepEqual(sanctionLoanListQuerySchema.parse({}), { page: 1, limit: 20, status: 'APPLIED' });
  assert.deepEqual(disbursementLoanListQuerySchema.parse({}), { page: 1, limit: 20, status: 'SANCTIONED' });
  assert.equal(sanctionLoanListQuerySchema.parse({ status: 'ALL', q: '  Demo Borrower  ' }).q, 'Demo Borrower');
  for (const query of [{ status: 'PENDING' }, { page: '0' }, { q: '' }, { q: 'a'.repeat(101) }, { borrowerId: 'forged' }]) assert.equal(sanctionLoanListQuerySchema.safeParse(query).success, false);
  for (const query of [{ status: 'APPLIED' }, { status: 'REJECTED' }, { q: '' }, { page: '0' }]) assert.equal(disbursementLoanListQuerySchema.safeParse(query).success, false);
  assert.deepEqual(sanctionDecisionSchema.parse({ decision: 'APPROVE' }), { decision: 'APPROVE' });
  assert.deepEqual(sanctionDecisionSchema.parse({ decision: 'REJECT', reason: '  Insufficient evidence.  ' }), { decision: 'REJECT', reason: 'Insufficient evidence.' });
  for (const body of [{}, { decision: 'APPROVE', reason: 'forged' }, { decision: 'REJECT' }, { decision: 'REJECT', reason: '   ' }, { decision: 'REJECT', reason: 'x'.repeat(1001) }, { decision: 'SANCTIONED' }]) assert.equal(sanctionDecisionSchema.safeParse(body).success, false);
});
