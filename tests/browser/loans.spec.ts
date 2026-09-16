import { randomUUID } from 'node:crypto';
import { readFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import mongoose from 'mongoose';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { DEMO_PASSWORD } from '../../apps/api/src/modules/auth/seed-accounts';
import { pdf } from '../../apps/api/tests/document-fixtures';
import { apiLogin, expectNoOverflow, mutationHeaders } from './helpers';

test.setTimeout(60000);
async function start(page: Page, email: string, withSlip = true) {
  const registered = await page.request.post('/api/v1/auth/register', { headers: mutationHeaders, data: { email, password: DEMO_PASSWORD } });
  expect(registered.status()).toBe(201);
  const created = await page.request.post('/api/v1/borrower/applications', { headers: mutationHeaders }); expect(created.status()).toBe(201);
  const id = (await created.json()).data.id as string;
  const details = await page.request.patch(`/api/v1/borrower/applications/${id}`, { headers: mutationHeaders, data: { personalDetails: { fullName: 'Synthetic Step Six', pan: 'ABCDE1234F', dob: '1995-06-15', monthlySalaryPaise: 2_500_000, employmentMode: 'SELF_EMPLOYED' } } }); expect(details.status()).toBe(200);
  if (withSlip) {
    const uploaded = await page.request.post(`/api/v1/borrower/applications/${id}/salary-slip`, { headers: mutationHeaders, multipart: { file: { name: 'synthetic-step-six.pdf', mimeType: 'application/pdf', buffer: pdf } } }); expect(uploaded.status()).toBe(201);
  }
  await page.goto(`/borrower/applications/${id}`); await expect(page.getByLabel('Full name', { exact: true })).toBeEnabled();
  return { applicationId: id, borrowerId: (await registered.json()).data.id as string };
}
async function cleanup(emails: string[]) {
  for (const email of emails) expect(email).toMatch(/^step6-[a-f\d-]+@example\.test$/);
  const connection = await mongoose.createConnection(process.env.MONGODB_URI!).asPromise();
  try {
    const users = await connection.collection('users').find({ email: { $in: emails } }).toArray();
    const ids = users.map((user) => user._id);
    const documents = await connection.collection('documents').find({ borrowerId: { $in: ids } }).toArray();
    await connection.collection('loans').deleteMany({ borrowerId: { $in: ids } });
    await connection.collection('applications').deleteMany({ borrowerId: { $in: ids } });
    const root = resolve(process.cwd(), process.env.UPLOAD_DIR ?? 'storage/uploads');
    for (const document of documents) {
      expect(document.storageKey).toMatch(/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}\.(pdf|jpg|png)$/);
      expect(await connection.collection('loans').countDocuments({ salarySlipId: document._id })).toBe(0);
      expect(await connection.collection('applications').countDocuments({ salarySlipId: document._id })).toBe(0);
      await unlink(resolve(root, document.storageKey)).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; });
    }
    await connection.collection('documents').deleteMany({ borrowerId: { $in: ids } });
    await connection.collection('users').deleteMany({ _id: { $in: ids }, email: { $in: emails } });
  } finally { await connection.close(); }
}
const value = (region: Locator, label: string) => region.getByText(label, { exact: true }).locator('..').locator('dd');
test('loan controls cover boundaries, persist exact terms and submit to a read-only loan with Sales exclusion', async ({ page }, testInfo) => {
  const email = `step6-${randomUUID()}@example.test`;
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  try {
    const { applicationId, borrowerId } = await start(page, email);
    const config = page.getByRole('region', { name: 'Loan configuration', exact: true });
    const preview = page.getByRole('region', { name: 'Repayment preview' });
    await page.getByRole('link', { name: '3. Loan configuration', exact: true }).click();
    await expect(value(preview, 'Interest')).toHaveText(/INR\s493\.15/);
    await page.getByRole('slider', { name: 'Loan amount slider' }).focus(); await page.keyboard.press('End');
    await expect(page.getByLabel('Loan amount (INR)', { exact: true })).toHaveValue('500000.00');
    await page.getByRole('slider', { name: 'Tenure slider' }).focus(); await page.keyboard.press('End');
    await expect(page.getByLabel('Tenure (days)', { exact: true })).toHaveValue('365');
    await expect(value(preview, 'Total repayment')).toHaveText(/INR\s5,60,000\.00/);
    await page.getByRole('slider', { name: 'Loan amount slider' }).focus(); await page.keyboard.press('Home');
    await expect(page.getByLabel('Loan amount (INR)', { exact: true })).toHaveValue('50000.00');
    for (const amount of ['49999.99', '500000.01', '100000.001', '']) {
      await page.getByLabel('Loan amount (INR)', { exact: true }).fill(amount);
      await expect(config.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled();
      await expect(page.getByLabel('Loan amount (INR)', { exact: true })).toHaveAttribute('aria-invalid', 'true');
    }
    await page.getByLabel('Loan amount (INR)', { exact: true }).fill('100000.01');
    for (const days of ['29', '366', '30.5']) {
      await page.getByLabel('Tenure (days)', { exact: true }).fill(days); await expect(config.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled();
    }
    await page.getByLabel('Tenure (days)', { exact: true }).fill('365');
    await expect(value(preview, 'Interest')).toHaveText(/INR\s12,000\.00/); await expect(value(preview, 'Total repayment')).toHaveText(/INR\s1,12,000\.01/);
    await config.getByRole('button', { name: 'Save loan terms' }).click(); await expect(config.getByRole('status')).toHaveText('Loan terms saved.');
    await page.reload(); await expect(page.getByLabel('Loan amount (INR)', { exact: true })).toBeEnabled();
    await expect(page.getByLabel('Loan amount (INR)', { exact: true })).toHaveValue('100000.01'); await expectNoOverflow(page);
    await page.screenshot({ path: testInfo.outputPath('loan-configuration.png'), fullPage: true });
    await config.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(page).toHaveURL(/\/borrower\/loans\/[a-f\d]{24}$/);
    const loanId = new URL(page.url()).pathname.split('/').at(-1)!;
    await expect(page.getByRole('heading', { name: 'Loan application', exact: true })).toBeVisible();
    await expect(page.getByText('Pending review', { exact: true })).toHaveCount(2);
    const terms = page.getByRole('region', { name: 'Loan terms' });
    await expect(value(terms, 'Total repayment')).toHaveText(/INR\s1,12,000\.01/); await expect(value(terms, 'Paid')).toHaveText(/INR\s0\.00/);
    await expect(page.getByRole('button', { name: 'Apply', exact: true })).toHaveCount(0);
    const downloading = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download salary slip' }).click();
    expect(await readFile((await (await downloading).path())!)).toEqual(pdf);
    await page.reload(); await expect(page.getByRole('button', { name: 'Refresh loan', exact: true })).toBeEnabled();
    await expectNoOverflow(page); await page.screenshot({ path: testInfo.outputPath('loan-submitted.png'), fullPage: true });
    await page.goto(`/borrower/applications/${applicationId}`); await expect(page).toHaveURL(`/borrower/loans/${loanId}`);
    await page.getByRole('link', { name: 'Applications and loans' }).click();
    const loans = page.getByRole('region', { name: 'Loans', exact: true });
    await expect(loans.getByRole('list', { name: 'Loan history' }).getByRole('listitem')).toHaveCount(1);
    await loans.getByLabel('Loan status', { exact: true }).selectOption('CLOSED'); await expect(loans.getByText('No loans with this status.')).toBeVisible();
    await loans.getByLabel('Loan status', { exact: true }).selectOption('APPLIED'); await expect(loans.getByRole('link', { name: `View loan ${loanId}` })).toBeVisible();
    await expectNoOverflow(page); await page.screenshot({ path: testInfo.outputPath('borrower-loan-history.png'), fullPage: true });
    await apiLogin(page.request, 'sales');
    expect((await page.request.get(`/api/v1/sales/leads/${borrowerId}`)).status()).toBe(404);
    expect(errors).toEqual([]);
  } finally { await cleanup([email]); }
});
test('failed saves preserve input and a lost submission response recovers the committed loan', async ({ page }) => {
  const email = `step6-${randomUUID()}@example.test`;
  try {
    const { applicationId } = await start(page, email);
    const config = page.getByRole('region', { name: 'Loan configuration', exact: true });
    await page.getByLabel('Loan amount (INR)', { exact: true }).fill('75000.25');
    const path = `**/api/v1/borrower/applications/${applicationId}`;
    await page.route(path, (route) => route.request().method() === 'PATCH' ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'DEPENDENCY_UNAVAILABLE', message: 'Temporary save failure.' } }) }) : route.continue());
    await config.getByRole('button', { name: 'Save loan terms' }).click(); await expect(config.getByRole('alert')).toHaveText('Temporary save failure.');
    await expect(config.getByRole('button', { name: 'Save loan terms' })).toBeEnabled(); await expect(page.getByLabel('Loan amount (INR)', { exact: true })).toHaveValue('75000.25');
    await page.unroute(path);
    await page.route(`${path}/submit`, async (route) => {
      const response = await route.fetch(); expect(response.status()).toBe(201);
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'SUBMISSION_UNCONFIRMED', message: 'Submission could not be confirmed.' } }) });
    });
    await config.getByRole('button', { name: 'Apply', exact: true }).click(); await expect(page).toHaveURL(/\/borrower\/loans\/[a-f\d]{24}$/);
    const result = await page.request.get('/api/v1/borrower/loans'); const loans = await result.json();
    expect(loans.pagination.total).toBe(1); expect(loans.data[0].principalPaise).toBe(7_500_025);
    const retry = await page.request.post(`/api/v1/borrower/applications/${applicationId}/submit`, { headers: mutationHeaders }); expect(retry.status()).toBe(409); expect((await retry.json()).error.meta.loanId).toBe(loans.data[0].id);
  } finally { await cleanup([email]); }
});
test('missing slips and stale eligibility block Apply; duplicate submission responses open the existing loan', async ({ page }) => {
  const email = `step6-${randomUUID()}@example.test`;
  try {
    const { applicationId } = await start(page, email, false);
    const config = page.getByRole('region', { name: 'Loan configuration', exact: true });
    await expect(config.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled();
    await page.locator('#salary-slip-file').setInputFiles({ name: 'synthetic.pdf', mimeType: 'application/pdf', buffer: pdf });
    await page.getByRole('button', { name: 'Upload salary slip', exact: true }).click(); await expect(config.getByRole('button', { name: 'Apply', exact: true })).toBeEnabled();
    await page.getByLabel('Full name', { exact: true }).fill('Changed Name'); await expect(config.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Save and check' }).click(); await expect(config.getByRole('button', { name: 'Apply', exact: true })).toBeEnabled();
    const changed = await page.request.patch(`/api/v1/borrower/applications/${applicationId}`, { headers: mutationHeaders, data: { personalDetails: { monthlySalaryPaise: 1 } } }); expect(changed.status()).toBe(200);
    await config.getByRole('button', { name: 'Apply', exact: true }).click(); await expect(config.getByRole('alert')).toContainText('does not meet the eligibility requirements');
    await expect(config.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled();
    await page.getByLabel('Monthly salary (INR)').fill('25000'); await page.getByRole('button', { name: 'Save and check' }).click();
    let submitted = 0;
    await page.route(`**/api/v1/borrower/applications/${applicationId}/submit`, async (route) => {
      submitted++;
      const first = await route.fetch(); expect(first.status()).toBe(201);
      const duplicate = await route.fetch(); expect(duplicate.status()).toBe(409);
      await route.fulfill({ response: duplicate });
    });
    await config.getByRole('button', { name: 'Apply', exact: true }).click(); await expect(page).toHaveURL(/\/borrower\/loans\/[a-f\d]{24}$/);
    expect(submitted).toBe(1); expect((await (await page.request.get('/api/v1/borrower/loans')).json()).pagination.total).toBe(1);
  } finally { await cleanup([email]); }
});
test('foreign borrowers and staff cannot open private loan pages or borrower loan APIs', async ({ page }) => {
  const email = `step6-${randomUUID()}@example.test`; const foreign = `step6-${randomUUID()}@example.test`;
  try {
    const { applicationId } = await start(page, email);
    const submitted = await page.request.post(`/api/v1/borrower/applications/${applicationId}/submit`, { headers: mutationHeaders }); expect(submitted.status()).toBe(201);
    const id = (await submitted.json()).data.id as string;
    await start(page, foreign, false);
    await page.goto(`/borrower/loans/${id}`); await expect(page.getByRole('heading', { name: '404', exact: true })).toBeVisible();
    expect((await page.request.get(`/api/v1/borrower/loans/${id}`)).status()).toBe(404);
    for (const role of ['sales', 'sanction', 'admin', 'disbursement', 'collection']) {
      await apiLogin(page.request, role); await page.goto(`/borrower/loans/${id}`);
      await expect(page.getByRole('heading', { name: 'Access denied', exact: true })).toBeVisible();
      expect((await page.request.get(`/api/v1/borrower/loans/${id}`)).status()).toBe(403);
    }
  } finally { await cleanup([email, foreign]); }
});
