import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applicationListQuerySchema, completedAge, eligibilityResultSchema, indiaDate, isDateOnly,
  paiseToRupees, rupeesToPaise, salesListQuerySchema, updateApplicationSchema, type PersonalDetails,
} from '@lms/shared';
import { evaluateEligibility, requireEligibility } from '../src/modules/applications/eligibility.js';
import { HttpError } from '../src/middleware/errors.js';

const now = new Date('2026-09-15T06:00:00.000Z');
const details: PersonalDetails = { fullName: 'Synthetic Borrower', pan: 'ABCDE1234F', dob: '1995-06-15', monthlySalaryPaise: 2_500_000, employmentMode: 'SALARIED' };
test('age boundaries include the 23rd birthday through the day before the 51st birthday', () => {
  for (const [dob, age, eligible] of [['2003-09-16', 22, false], ['2003-09-15', 23, true], ['1976-09-15', 50, true], ['1975-09-16', 50, true], ['1975-09-15', 51, false]] as const) {
    const result = evaluateEligibility({ ...details, dob }, now);
    assert.equal(result.ageYears, age); assert.equal(result.eligible, eligible);
    eligibilityResultSchema.parse(result);
  }
});
test('leap-day birthdays advance on March 1 in non-leap years', () => {
  assert.equal(completedAge('2004-02-29', '2027-02-28'), 22);
  assert.equal(completedAge('2004-02-29', '2027-03-01'), 23);
  assert.equal(completedAge('2000-02-29', '2024-02-28'), 23);
  assert.equal(completedAge('2000-02-29', '2024-02-29'), 24);
  assert.equal(isDateOnly('1900-02-29'), false); assert.equal(isDateOnly('2000-02-29'), true);
});
test('age and DOB validation use the Indian date boundary, independently of server timezone', () => {
  const before = new Date('2026-09-14T18:29:59.999Z');
  const after = new Date('2026-09-14T18:30:00.000Z');
  assert.equal(indiaDate(before), '2026-09-14'); assert.equal(indiaDate(after), '2026-09-15');
  assert.equal(evaluateEligibility({ ...details, dob: '2003-09-15' }, before).eligible, false);
  assert.equal(evaluateEligibility({ ...details, dob: '2003-09-15' }, after).eligible, true);
  assert.equal(updateApplicationSchema(before).safeParse({ personalDetails: { dob: '2026-09-15' } }).success, false);
  assert.equal(updateApplicationSchema(after).safeParse({ personalDetails: { dob: '2026-09-15' } }).success, true);
});
test('salary threshold, PAN normalization and both permitted employment modes are enforced', () => {
  assert.equal(evaluateEligibility({ ...details, monthlySalaryPaise: 2_499_999 }, now).failures[0]?.code, 'SALARY_TOO_LOW');
  for (const employmentMode of ['SALARIED', 'SELF_EMPLOYED']) {
    assert.equal(evaluateEligibility({ ...details, pan: ' abcde1234f ', employmentMode }, now).eligible, true);
  }
  assert.equal(evaluateEligibility({ ...details, employmentMode: 'UNEMPLOYED' }, now).failures[0]?.code, 'EMPLOYMENT_INELIGIBLE');
});
test('BRE reports all failed rules in field order without echoing private values', () => {
  const result = evaluateEligibility({ ...details, fullName: null, pan: 'PRIVATE-PAN', dob: '2010-01-01', monthlySalaryPaise: 100, employmentMode: 'UNEMPLOYED' }, now);
  assert.deepEqual(result.failures.map((failure) => failure.field), ['fullName', 'pan', 'dob', 'monthlySalaryPaise', 'employmentMode']);
  assert.equal(JSON.stringify(result.failures).includes('PRIVATE-PAN'), false);
  assert.deepEqual(evaluateEligibility({}, now).failures.map((failure) => failure.code), Array(5).fill('REQUIRED'));
});
test('invalid types, impossible and future dates fail without a misleading age failure', () => {
  for (const dob of ['2025-02-29', '2026-09-16', '2026-13-01', '2026-01-32', '15/09/1995', 19950101]) {
    const result = evaluateEligibility({ ...details, dob }, now);
    assert.equal(result.ageYears, null); assert.equal(result.failures.length, 1); assert.equal(result.failures[0]?.code, 'INVALID_FORMAT');
  }
  for (const monthlySalaryPaise of [-1, 2_500_000.5, '2500000', NaN, Infinity]) {
    assert.equal(evaluateEligibility({ ...details, monthlySalaryPaise }, now).failures[0]?.code, 'INVALID_FORMAT');
  }
});
test('submission guard throws field-addressed BRE errors and never trusts a stored earlier pass', () => {
  assert.equal(requireEligibility(details, now).eligible, true);
  assert.throws(() => requireEligibility({ ...details, monthlySalaryPaise: 1 }, now), (error: unknown) => {
    assert.ok(error instanceof HttpError); assert.equal(error.status, 422); assert.equal(error.code, 'BRE_FAILED');
    assert.ok(error.details?.fields?.['personalDetails.monthlySalaryPaise']); return true;
  });
});
test('draft validation rejects empty patches, unknown fields, type coercion and invalid financial terms', () => {
  for (const body of [{}, { personalDetails: {} }, { loanConfig: {} }, { personalDetails: null }, { loanConfig: null }, { role: 'ADMIN' },
    { personalDetails: { monthlySalaryPaise: '2500000' } }, { personalDetails: { employmentMode: 'OTHER' } },
    { personalDetails: { fullName: 'a' } }, { personalDetails: { fullName: 'x'.repeat(121) } },
    { loanConfig: { principalPaise: 4_999_999 } }, { loanConfig: { tenureDays: 366 } }, { loanConfig: { interestPaise: 1 } }]) {
    assert.equal(updateApplicationSchema(now).safeParse(body).success, false, JSON.stringify(body));
  }
  assert.equal(updateApplicationSchema(now).safeParse({ personalDetails: { fullName: '\u{1F600}'.repeat(120), pan: 'x'.repeat(32) } }).success, true);
  assert.equal(updateApplicationSchema(now).parse({ personalDetails: { fullName: null } }).personalDetails?.fullName, null);
});
test('rupee conversion is exact through the safe-integer limit and rejects excess decimals', () => {
  assert.equal(rupeesToPaise('24999.99'), 2_499_999); assert.equal(rupeesToPaise('25000'), 2_500_000);
  assert.equal(rupeesToPaise('0.29'), 29); assert.equal(paiseToRupees(29), '0.29');
  assert.equal(rupeesToPaise(paiseToRupees(Number.MAX_SAFE_INTEGER)), Number.MAX_SAFE_INTEGER);
  for (const input of ['-1', '1.001', '1e4', 'NaN', '1,000', '90071992547409.92']) assert.throws(() => rupeesToPaise(input));
});
test('list queries are strict and bounded, allowing only literal Sales search text', () => {
  assert.deepEqual(applicationListQuerySchema.parse({}), { page: 1, limit: 20 });
  for (const query of [{ page: '0' }, { page: '1.5' }, { limit: '101' }, { limit: ['20', '30'] }, { page: '9007199254740992' }, { sort: '$where' }, { q: 'name' }]) {
    assert.equal(applicationListQuerySchema.safeParse(query).success, false);
  }
  assert.equal(salesListQuerySchema.parse({ q: ' .* ' }).q, '.*');
  assert.equal(salesListQuerySchema.safeParse({ q: { $ne: '' } }).success, false);
});
