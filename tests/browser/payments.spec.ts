import { randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import mongoose from 'mongoose';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { indiaDate, paiseToRupees } from '@lms/shared';
import { DEMO_PASSWORD } from '../../apps/api/src/modules/auth/seed-accounts';
import { pdf } from '../../apps/api/tests/document-fixtures';
import { apiLogin, expectNoOverflow, mutationHeaders, uiLogin } from './helpers';

test.setTimeout(90000);
const balance = (region: Locator, label: string) => region.getByText(label, { exact: true }).locator('..').locator('dd');
async function cleanup(email: string) {
  expect(email).toMatch(/^step8-[a-f\d-]+@example\.test$/);
  const connection = await mongoose.createConnection(process.env.MONGODB_URI!).asPromise();
  try {
    const user = await connection.collection('users').findOne({ email });
    if (!user) return;
    const loans = await connection.collection('loans').find({ borrowerId: user._id }).toArray();
    const documents = await connection.collection('documents').find({ borrowerId: user._id }).toArray();
    await connection.collection('payments').deleteMany({ loanId: { $in: loans.map((loan) => loan._id) } });
    await connection.collection('loans').deleteMany({ borrowerId: user._id });
    await connection.collection('applications').deleteMany({ borrowerId: user._id });
    const root = resolve(process.cwd(), process.env.UPLOAD_DIR ?? 'storage/uploads');
    for (const document of documents) {
      expect(document.storageKey).toMatch(/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}\.(pdf|jpg|png)$/);
      await unlink(resolve(root, document.storageKey)).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; });
    }
    await connection.collection('documents').deleteMany({ borrowerId: user._id });
    await connection.collection('users').deleteOne({ _id: user._id, email });
  } finally { await connection.close(); }
}
async function enterPayment(page: Page, utr: string, amount: string) {
  await page.getByLabel('UTR', { exact: true }).fill(utr);
  await page.getByLabel('Amount in INR').fill(amount);
  await page.getByLabel('Payment date', { exact: true }).fill(indiaDate(new Date()));
  await page.getByRole('button', { name: 'Record payment', exact: true }).click();
}
async function loginBorrower(page: Page, email: string) {
  expect((await page.request.post('/api/v1/auth/login', { headers: mutationHeaders, data: { email, password: DEMO_PASSWORD } })).status()).toBe(200);
}
async function createDisbursed(page: Page, email: string) {
  expect((await page.request.post('/api/v1/auth/register', { headers: mutationHeaders, data: { email, password: DEMO_PASSWORD } })).status()).toBe(201);
  const created = await page.request.post('/api/v1/borrower/applications', { headers: mutationHeaders }); expect(created.status()).toBe(201);
  const id = (await created.json()).data.id as string;
  expect((await page.request.patch(`/api/v1/borrower/applications/${id}`, { headers: mutationHeaders, data: { personalDetails: { fullName: 'Payment Recovery', pan: 'ABCDE1234F', dob: '1995-06-15', monthlySalaryPaise: 2_500_000, employmentMode: 'SALARIED' } } })).status()).toBe(200);
  expect((await page.request.post(`/api/v1/borrower/applications/${id}/salary-slip`, { headers: mutationHeaders, multipart: { file: { name: 'synthetic.pdf', mimeType: 'application/pdf', buffer: pdf } } })).status()).toBe(201);
  const submitted = await page.request.post(`/api/v1/borrower/applications/${id}/submit`, { headers: mutationHeaders }); expect(submitted.status()).toBe(201);
  const loanId = (await submitted.json()).data.id as string;
  await apiLogin(page.request, 'sanction');
  expect((await page.request.post(`/api/v1/sanction/loans/${loanId}/decision`, { headers: mutationHeaders, data: { decision: 'APPROVE' } })).status()).toBe(200);
  await apiLogin(page.request, 'disbursement');
  expect((await page.request.post(`/api/v1/disbursement/loans/${loanId}/disburse`, { headers: mutationHeaders })).status()).toBe(200);
  await apiLogin(page.request, 'collection');
  return loanId;
}

test('complete UI lifecycle from signup to two payments and closure persists for staff and borrower', async ({ page }, testInfo) => {
  const email = `step8-${randomUUID()}@example.test`;
  const utr = `BROWSER-${randomUUID()}`.toUpperCase();
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto('/register');
    await page.getByLabel('Email address', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(DEMO_PASSWORD);
    await page.getByLabel('Confirm password', { exact: true }).fill(DEMO_PASSWORD);
    await page.getByRole('button', { name: 'Create borrower account', exact: true }).click();
    await expect(page).toHaveURL('/borrower');
    await page.getByRole('button', { name: 'Start application', exact: true }).click();
    await expect(page).toHaveURL(/\/borrower\/applications\/[a-f\d]{24}$/);
    await page.getByLabel('Full name', { exact: true }).fill('Full Lifecycle Borrower');
    await page.getByLabel('PAN', { exact: true }).fill('abcde1234f');
    await page.getByLabel('Date of birth', { exact: true }).fill('1995-06-15');
    await page.getByLabel('Monthly salary (INR)').fill('25000');
    await page.getByLabel('Employment mode', { exact: true }).selectOption('SALARIED');
    await page.getByRole('button', { name: 'Save and check', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Eligibility result' }).getByRole('status')).toHaveText('Eligible');
    await page.locator('#salary-slip-file').setInputFiles({ name: 'synthetic-lifecycle.pdf', mimeType: 'application/pdf', buffer: pdf });
    await page.getByRole('button', { name: 'Upload salary slip', exact: true }).click();
    await page.getByLabel('Loan amount (INR)', { exact: true }).fill('100000');
    await page.getByLabel('Tenure (days)', { exact: true }).fill('365');
    await page.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(page).toHaveURL(/\/borrower\/loans\/[a-f\d]{24}$/);
    const id = new URL(page.url()).pathname.split('/').at(-1)!;
    await expect(page.getByText('No payments have been recorded.')).toBeVisible();

    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page).toHaveURL('/login');
    await uiLogin(page, 'sanction'); await expect(page).toHaveURL('/dashboard/sanction');
    await page.getByRole('searchbox', { name: 'Search loans', exact: true }).fill(email); await page.getByRole('button', { name: 'Search loans', exact: true }).click();
    await page.getByRole('link', { name: 'View loan for Full Lifecycle Borrower' }).click();
    await page.getByRole('button', { name: 'Approve loan', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard\/sanction\?status=APPLIED$/);
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page).toHaveURL('/login');
    await uiLogin(page, 'disbursement'); await expect(page).toHaveURL('/dashboard/disbursement');
    await page.getByRole('searchbox', { name: 'Search loans', exact: true }).fill(email); await page.getByRole('button', { name: 'Search loans', exact: true }).click();
    await page.getByRole('link', { name: 'View loan for Full Lifecycle Borrower' }).click();
    await page.getByRole('button', { name: 'Mark disbursed', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard\/disbursement\?status=SANCTIONED$/);
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page).toHaveURL('/login');
    await uiLogin(page, 'collection'); await expect(page).toHaveURL('/dashboard/collection');
    await page.getByRole('searchbox', { name: 'Search loans', exact: true }).fill(email); await page.getByRole('button', { name: 'Search loans', exact: true }).click();
    await page.getByRole('link', { name: 'View loan for Full Lifecycle Borrower' }).click();
    await expect(page.getByText('PAN', { exact: true })).toHaveCount(0);
    const terms = page.getByRole('region', { name: 'Loan terms' });
    await expect(balance(terms, 'Outstanding')).toHaveText(/INR\s1,12,000\.00/);
    await enterPayment(page, utr, '40000.001');
    await expect(page.getByRole('main').getByRole('alert')).toContainText('at most two decimal places');
    await enterPayment(page, utr, '40000'); await expect(page.getByRole('status')).toHaveText('Payment recorded.');
    await expect(balance(terms, 'Outstanding')).toHaveText(/INR\s72,000\.00/);
    await expectNoOverflow(page); await page.screenshot({ path: testInfo.outputPath('collection-partial.png'), fullPage: true });
    await enterPayment(page, utr.toLowerCase(), '40000'); await expect(page.getByRole('main').getByRole('alert')).toHaveText('This UTR has already been recorded.');
    await expect(balance(terms, 'Paid')).toHaveText(/INR\s40,000\.00/);
    await enterPayment(page, `${utr}-FINAL`, '72000'); await expect(page.getByRole('status')).toHaveText('Final payment recorded. This loan is now closed.');
    await expect(balance(terms, 'Outstanding')).toHaveText(/INR\s0\.00/);
    await expect(page.getByRole('button', { name: 'Record payment', exact: true })).toHaveCount(0);
    await page.reload(); await expect(page.getByRole('list', { name: 'Payment history', exact: true }).getByRole('listitem')).toHaveCount(2);
    await expectNoOverflow(page); await page.screenshot({ path: testInfo.outputPath('collection-closed.png'), fullPage: true });
    await page.getByRole('link', { name: 'Collection queue', exact: true }).click();
    await page.getByRole('searchbox', { name: 'Search loans', exact: true }).fill(email); await page.getByRole('button', { name: 'Search loans', exact: true }).click();
    await expect(page.getByText('No matching loans.')).toBeVisible();
    await page.getByLabel('Loan status', { exact: true }).selectOption('CLOSED');
    await expect(page.getByRole('link', { name: 'View loan for Full Lifecycle Borrower' })).toBeVisible();
    await loginBorrower(page, email); await page.goto(`/borrower/loans/${id}`);
    await expect(page.getByText('Closed', { exact: true })).toHaveCount(2);
    await expect(page.getByRole('list', { name: 'Payment history', exact: true }).getByRole('listitem')).toHaveCount(2);
    await expectNoOverflow(page); await page.screenshot({ path: testInfo.outputPath('borrower-closed.png'), fullPage: true });
    expect(errors).toEqual([]);
  } finally { await cleanup(email); }
});

test('payment retries, failed ledger refreshes and paginated borrower history remain consistent', async ({ page }) => {
  const email = `step8-${randomUUID()}@example.test`;
  const utr = `RECOVERY-${randomUUID()}`.toUpperCase();
  try {
    const id = await createDisbursed(page, email);
    await page.goto(`/dashboard/collection/${id}`);
    const path = `**/api/v1/collection/loans/${id}/payments`;
    await page.route(path, async (route) => {
      const result = await route.fetch(); expect(result.status()).toBe(201);
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'PAYMENT_UNCONFIRMED', message: 'Payment could not be confirmed. Refresh history before retrying with the same UTR.' } }) });
    });
    await enterPayment(page, utr, '10'); await expect(page.getByRole('main').getByRole('alert')).toContainText('Payment could not be confirmed');
    await expect(page.getByRole('list', { name: 'Payment history', exact: true }).getByText(utr, { exact: true })).toBeVisible();
    await expect(page.getByLabel('UTR', { exact: true })).toHaveValue(utr);
    await page.unroute(path);
    await page.getByRole('button', { name: 'Record payment', exact: true }).click(); await expect(page.getByRole('main').getByRole('alert')).toHaveText('This UTR has already been recorded.');

    await page.route(`${path}?*`, (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'DEPENDENCY_UNAVAILABLE', message: 'Synthetic history failure.' } }) }));
    await enterPayment(page, `${utr}-SECOND`, '20');
    await expect(page.getByRole('status')).toHaveText('Payment recorded.');
    await expect(page.getByRole('main').getByRole('alert')).toContainText('Payment recorded, but history could not be refreshed');
    await page.unroute(`${path}?*`);
    for (let index = 0; index < 19; index++) {
      const response = await page.request.post(`/api/v1/collection/loans/${id}/payments`, { headers: mutationHeaders, data: { utr: `${utr}-PAGE-${index}`, amountPaise: 1, paymentDate: indiaDate(new Date()) } });
      expect(response.status()).toBe(201);
    }
    await page.getByRole('button', { name: 'Refresh loan', exact: true }).click();
    const history = page.getByRole('region', { name: 'Payment history', exact: true });
    await expect(history.getByText('21 recorded')).toBeVisible();
    await history.getByRole('button', { name: 'Next page', exact: true }).click();
    await expect(history.getByRole('listitem')).toHaveCount(1);
    await expect(history.getByText(utr, { exact: true })).toBeVisible();
    await loginBorrower(page, email); await page.goto(`/borrower/loans/${id}`);
    await expect(history.getByRole('listitem')).toHaveCount(20);
    await history.getByRole('button', { name: 'Next page', exact: true }).click(); await expect(history.getByRole('listitem')).toHaveCount(1);
    await history.getByLabel('Rows per page', { exact: true }).selectOption('50'); await expect(history.getByRole('listitem')).toHaveCount(21);
    await expectNoOverflow(page);

    await apiLogin(page.request, 'admin');
    const loan = (await (await page.request.get(`/api/v1/collection/loans/${id}`)).json()).data;
    await page.goto(`/dashboard/collection/${id}`); await enterPayment(page, `${utr}-FINAL`, paiseToRupees(loan.outstandingPaise));
    await expect(page.getByRole('status')).toHaveText('Final payment recorded. This loan is now closed.');
    for (const role of ['sales', 'sanction', 'disbursement', 'borrower']) {
      await apiLogin(page.request, role); await page.goto(`/dashboard/collection/${id}`);
      await expect(page.getByRole('heading', { name: 'Access denied', exact: true })).toBeVisible();
      expect((await page.request.get(`/api/v1/collection/loans/${id}/payments`)).status()).toBe(403);
    }
  } finally { await cleanup(email); }
});
