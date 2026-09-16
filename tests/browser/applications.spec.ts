import { randomUUID } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';
import mongoose from 'mongoose';
import { DEMO_PASSWORD } from '../../apps/api/src/modules/auth/seed-accounts';
import { apiLogin, browserOrigin, expectNoOverflow, mutationHeaders } from './helpers';

test.setTimeout(60000);
async function register(page: Page, email: string) {
  const response = await page.request.post('/api/v1/auth/register', { headers: mutationHeaders, data: { email, password: DEMO_PASSWORD } });
  expect(response.status()).toBe(201);
  return (await response.json()).data.id as string;
}
async function cleanAccounts(emails: string[]) {
  const connection = await mongoose.createConnection(process.env.MONGODB_URI!).asPromise();
  try {
    const users = await connection.collection('users').find({ email: { $in: emails } }, { projection: { _id: 1 } }).toArray();
    await connection.collection('applications').deleteMany({ borrowerId: { $in: users.map((user) => user._id) } });
    await connection.collection('users').deleteMany({ _id: { $in: users.map((user) => user._id) }, email: { $in: emails } });
  } finally { await connection.close(); }
}
async function start(page: Page) {
  await page.goto('/borrower');
  await page.getByRole('button', { name: 'Start application', exact: true }).click();
  await expect(page).toHaveURL(/\/borrower\/applications\/[a-f0-9]{24}$/);
  await expect(page.getByLabel('Full name', { exact: true })).toBeEnabled();
  return new URL(page.url()).pathname.split('/').at(-1)!;
}
async function fillValid(page: Page) {
  await page.getByLabel('Full name', { exact: true }).fill('Synthetic Step Four');
  await page.getByLabel('PAN', { exact: true }).fill('abcde1234f');
  await page.getByLabel('Date of birth', { exact: true }).fill('1995-06-15');
  await page.getByLabel('Monthly salary (INR)').fill('25000');
  await page.getByLabel('Employment mode', { exact: true }).selectOption('SELF_EMPLOYED');
}
async function save(page: Page) {
  await page.getByRole('button', { name: 'Save and check' }).click();
  await expect(page.getByText('Draft saved.', { exact: true })).toBeVisible();
}

test('borrower saves and corrects eligibility, reloads the draft, and Sales sees private-data-free progress', async ({ page, browser }, testInfo) => {
  const email = `step4-${randomUUID()}@example.test`;
  const salesContext = await browser.newContext({ baseURL: browserOrigin, viewport: page.viewportSize()! });
  const salesPage = await salesContext.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  salesPage.on('pageerror', (error) => errors.push(error.message));
  try {
    const borrowerId = await register(page, email);
    await apiLogin(salesPage.request, 'sales');
    await salesPage.goto('/dashboard/sales');
    await salesPage.getByLabel('Search borrowers').fill(email);
    await salesPage.getByRole('button', { name: 'Search leads', exact: true }).click();
    await expect(salesPage.getByRole('list', { name: 'Sales leads' }).getByRole('listitem')).toHaveCount(1);
    await salesPage.getByRole('link', { name: `View lead ${email}` }).click();
    await expect(salesPage.getByText('No application started', { exact: true })).toBeVisible();
    const id = await start(page);
    await fillValid(page);
    await page.getByLabel('PAN', { exact: true }).fill('BAD-PAN');
    await page.getByLabel('Date of birth', { exact: true }).fill('2010-01-01');
    await page.getByLabel('Monthly salary (INR)').fill('24999.99');
    await page.getByLabel('Employment mode', { exact: true }).selectOption('UNEMPLOYED');
    await save(page);
    const eligibility = page.getByRole('region', { name: 'Eligibility result' });
    await expect(eligibility.getByRole('status')).toHaveText('Not eligible');
    for (const text of ['Age must be between 23 and 50 years, inclusive.', 'Monthly salary must be at least INR 25,000.', 'Employment must be Salaried or Self-employed.']) {
      await expect(eligibility.getByText(text, { exact: true })).toBeVisible();
    }
    const attempted = await page.request.post(`/api/v1/borrower/applications/${id}/submit`, { headers: mutationHeaders });
    expect(attempted.status()).toBe(422); expect((await attempted.json()).error.code).toBe('BRE_FAILED');
    await expectNoOverflow(page);
    await page.screenshot({ path: testInfo.outputPath('eligibility-failed.png'), fullPage: true });
    await page.reload();
    await expect(page.getByLabel('Monthly salary (INR)')).toHaveValue('24999.99');
    await expect(page.getByLabel('PAN', { exact: true })).toHaveValue('BAD-PAN');
    await fillValid(page); await save(page);
    await expect(eligibility.getByRole('status')).toHaveText('Eligible');
    await expect(page.getByLabel('PAN', { exact: true })).toHaveValue('ABCDE1234F');
    await expect(page.getByLabel('Monthly salary (INR)')).toHaveValue('25000.00');
    await page.screenshot({ path: testInfo.outputPath('eligibility-passed.png'), fullPage: true });
    await page.getByLabel('Monthly salary (INR)').fill('1');
    await expect(eligibility.getByRole('status')).toHaveText('Unsaved changes');
    await expect(page.getByRole('button', { name: 'Recheck eligibility' })).toBeDisabled();
    await page.getByLabel('Monthly salary (INR)').fill('25000.00');
    await page.getByRole('button', { name: 'Recheck eligibility' }).click();
    await expect(eligibility.getByRole('status')).toHaveText('Eligible');
    await page.getByRole('link', { name: 'Applications', exact: true }).click();
    await page.getByRole('button', { name: 'Resume application', exact: true }).click();
    await expect(page).toHaveURL(`/borrower/applications/${id}`);
    await expect(page.getByLabel('Full name', { exact: true })).toHaveValue('Synthetic Step Four');
    await salesPage.reload();
    await expect(salesPage.getByRole('heading', { name: 'Synthetic Step Four', exact: true })).toBeVisible();
    await expect(salesPage.getByText('Self-employed', { exact: true })).toBeVisible();
    await expect(salesPage.getByRole('region', { name: 'Eligibility result' }).getByRole('status')).toHaveText('Eligible');
    const body = await salesPage.getByRole('main').innerText();
    for (const privateValue of ['ABCDE1234F', '1995-06-15', '25000.00']) expect(body).not.toContain(privateValue);
    expect((await salesPage.request.get(`/api/v1/sales/leads/${borrowerId}`)).status()).toBe(200);
    await expectNoOverflow(salesPage);
    await salesPage.screenshot({ path: testInfo.outputPath('sales-lead.png'), fullPage: true });
    await salesPage.getByRole('link', { name: 'Sales leads', exact: true }).click();
    await expect(salesPage.getByLabel('Search borrowers')).toHaveValue(email);
    await expect(salesPage.getByText('Synthetic Step Four', { exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  } finally { await salesContext.close(); await cleanAccounts([email]); }
});

test('invalid paise precision and failed saves preserve entered details and allow retry', async ({ page }, testInfo) => {
  const email = `step4-retry-${randomUUID()}@example.test`;
  try {
    await register(page, email); const id = await start(page); await fillValid(page);
    await page.getByLabel('Monthly salary (INR)').fill('25000.001');
    await page.getByRole('button', { name: 'Save and check' }).click();
    await expect(page.locator('form').getByRole('alert')).toContainText('at most 2 decimal places');
    expect((await (await page.request.get(`/api/v1/borrower/applications/${id}`)).json()).data.personalDetails.fullName).toBeNull();
    await page.getByLabel('Monthly salary (INR)').fill('25000');
    await page.route(`**/api/v1/borrower/applications/${id}`, (route) => route.request().method() === 'PATCH'
      ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'DEPENDENCY_UNAVAILABLE', message: 'Temporarily unavailable.' } }) }) : route.continue());
    await page.getByRole('button', { name: 'Save and check' }).click();
    await expect(page.locator('form').getByRole('alert')).toHaveText('Temporarily unavailable.');
    await expect(page.getByLabel('Full name', { exact: true })).toHaveValue('Synthetic Step Four');
    await expect(page.getByRole('button', { name: 'Save and check' })).toBeEnabled();
    await page.unroute(`**/api/v1/borrower/applications/${id}`);
    await save(page);
    await page.getByLabel('Full name', { exact: true }).fill(''); await save(page);
    await expect(page.getByRole('region', { name: 'Eligibility result' }).getByText('Full name is required.')).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Full name', { exact: true })).toHaveValue('');
    await expect(page.getByLabel('PAN', { exact: true })).toHaveValue('ABCDE1234F');
    await expectNoOverflow(page);
    await page.screenshot({ path: testInfo.outputPath('partial-draft.png'), fullPage: true });
  } finally { await cleanAccounts([email]); }
});

test('Sales pagination, literal search, refresh and detail return preserve list context', async ({ page }, testInfo) => {
  const prefix = `step4-list-${randomUUID()}`;
  const emails = Array.from({ length: 23 }, (_, index) => `${prefix}-${index}@example.test`);
  const connection = await mongoose.createConnection(process.env.MONGODB_URI!).asPromise();
  try {
    await connection.collection('users').insertMany(emails.map((email) => ({ email, role: 'BORROWER', passwordHash: 'synthetic-list-only-no-login', createdAt: new Date(), updatedAt: new Date() })));
  } finally { await connection.close(); }
  try {
    await apiLogin(page.request, 'sales');
    await page.goto('/dashboard/sales');
    await page.getByLabel('Search borrowers').fill(prefix);
    await page.getByRole('button', { name: 'Search leads', exact: true }).click();
    const rows = page.getByRole('list', { name: 'Sales leads' }).getByRole('listitem');
    await expect(rows).toHaveCount(20);
    await page.getByLabel('Rows per page').selectOption('10');
    await expect(rows).toHaveCount(10);
    await page.getByRole('button', { name: 'Next page', exact: true }).click();
    await expect(page.getByText('Page 2 of 3', { exact: true })).toBeVisible();
    await rows.first().getByRole('link').click();
    await expect(page.getByText('No application started', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Sales leads', exact: true }).click();
    await expect(page.getByText('Page 2 of 3', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Search borrowers')).toHaveValue(prefix);
    await page.getByRole('button', { name: 'Refresh leads', exact: true }).click();
    await expect(rows).toHaveCount(10);
    await expectNoOverflow(page);
    await page.screenshot({ path: testInfo.outputPath('sales-list.png'), fullPage: true });
    await page.getByLabel('Search borrowers').fill('.*');
    await page.getByRole('button', { name: 'Search leads', exact: true }).click();
    await expect(page.getByText('No matching borrowers.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Clear search', exact: true }).click();
    await expect(page.getByLabel('Search borrowers')).toHaveValue('');
  } finally { await cleanAccounts(emails); }
});

test('foreign borrowers and wrong staff roles cannot read application or Sales detail pages', async ({ page }) => {
  const email = `step4-owner-${randomUUID()}@example.test`;
  const foreignEmail = `step4-foreign-${randomUUID()}@example.test`;
  try {
    const borrowerId = await register(page, email); const id = await start(page); await fillValid(page); await save(page);
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page).toHaveURL('/login');
    await register(page, foreignEmail);
    await page.goto(`/borrower/applications/${id}`);
    await expect(page.getByRole('heading', { name: '404', exact: true })).toBeVisible();
    expect((await page.request.get(`/api/v1/borrower/applications/${id}`)).status()).toBe(404);
    for (const role of ['borrower', 'sanction', 'disbursement', 'collection']) {
      await apiLogin(page.request, role);
      await page.goto(`/dashboard/sales/${borrowerId}`);
      await expect(page.getByRole('heading', { name: 'Access denied', exact: true })).toBeVisible();
    }
    for (const role of ['sales', 'admin']) {
      await apiLogin(page.request, role);
      await page.goto(`/borrower/applications/${id}`);
      await expect(page.getByRole('heading', { name: 'Access denied', exact: true })).toBeVisible();
    }
  } finally { await cleanAccounts([email, foreignEmail]); }
});
