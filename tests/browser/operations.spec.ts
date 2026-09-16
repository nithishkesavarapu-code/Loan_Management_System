import { randomUUID } from 'node:crypto';
import { readFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import mongoose from 'mongoose';
import { expect, test, type Page } from '@playwright/test';
import { DEMO_PASSWORD } from '../../apps/api/src/modules/auth/seed-accounts';
import { pdf } from '../../apps/api/tests/document-fixtures';
import { apiLogin, expectNoOverflow, mutationHeaders } from './helpers';

test.setTimeout(60000);
async function createSubmittedLoan(page: Page, email: string, name: string) {
  const registered = await page.request.post('/api/v1/auth/register', { headers: mutationHeaders, data: { email, password: DEMO_PASSWORD } });
  expect(registered.status()).toBe(201);
  const application = await page.request.post('/api/v1/borrower/applications', { headers: mutationHeaders }); expect(application.status()).toBe(201);
  const applicationId = (await application.json()).data.id as string;
  const saved = await page.request.patch(`/api/v1/borrower/applications/${applicationId}`, { headers: mutationHeaders, data: { personalDetails: { fullName: name, pan: 'ABCDE1234F', dob: '1995-06-15', monthlySalaryPaise: 2_500_000, employmentMode: 'SALARIED' } } }); expect(saved.status()).toBe(200);
  const uploaded = await page.request.post(`/api/v1/borrower/applications/${applicationId}/salary-slip`, { headers: mutationHeaders, multipart: { file: { name: 'step-seven.pdf', mimeType: 'application/pdf', buffer: pdf } } }); expect(uploaded.status()).toBe(201);
  const submitted = await page.request.post(`/api/v1/borrower/applications/${applicationId}/submit`, { headers: mutationHeaders }); expect(submitted.status()).toBe(201);
  return { applicationId, loanId: (await submitted.json()).data.id as string };
}
async function login(page: Page, email: string) {
  const response = await page.request.post('/api/v1/auth/login', { headers: mutationHeaders, data: { email, password: DEMO_PASSWORD } });
  expect(response.status()).toBe(200);
}
async function filterLoans(page: Page, email: string) {
  await page.getByRole('searchbox', { name: 'Search loans', exact: true }).fill(email);
  await page.getByRole('button', { name: 'Search loans', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`q=${encodeURIComponent(email)}`));
}
async function cleanup(emails: string[]) {
  for (const email of emails) expect(email).toMatch(/^step7-[a-f\d-]+@example\.test$/);
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
      await unlink(resolve(root, document.storageKey)).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; });
    }
    await connection.collection('documents').deleteMany({ borrowerId: { $in: ids } });
    await connection.collection('users').deleteMany({ _id: { $in: ids }, email: { $in: emails } });
  } finally { await connection.close(); }
}

test('Sanction rejection and approval-to-disbursement are usable and borrower statuses update', async ({ page }, testInfo) => {
  const rejectedEmail = `step7-${randomUUID()}@example.test`;
  const approvedEmail = `step7-${randomUUID()}@example.test`;
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  try {
    const rejected = await createSubmittedLoan(page, rejectedEmail, 'Browser Rejection');
    await apiLogin(page.request, 'sanction');
    await page.goto('/dashboard/sanction');
    await filterLoans(page, rejectedEmail);
    const reviewQueue = page.getByRole('list', { name: 'Loan review queue' });
    await expect(reviewQueue.getByText('Browser Rejection', { exact: true })).toBeVisible();
    await reviewQueue.getByRole('link', { name: 'View loan for Browser Rejection' }).click();
    await expect(page.getByRole('heading', { name: 'Browser Rejection', exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Applicant details' }).getByText('ABCDE1234F', { exact: true })).toBeVisible();
    const downloading = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download salary slip' }).click();
    expect(await readFile((await (await downloading).path())!)).toEqual(pdf);
    await page.getByRole('button', { name: 'Reject loan', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Reject loan', exact: true })).toBeDisabled();
    await page.getByLabel('Rejection reason').fill('Income evidence is incomplete.');
    await page.getByRole('button', { name: 'Reject loan', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard\/sanction\?status=APPLIED$/);
    await filterLoans(page, rejectedEmail);
    await expect(page.getByText('No matching loans.')).toBeVisible();
    await login(page, rejectedEmail); await page.goto(`/borrower/loans/${rejected.loanId}`);
    await expect(page.getByText('Rejected', { exact: true })).toHaveCount(2);
    await expect(page.getByRole('region', { name: 'Rejection reason' })).toContainText('Income evidence is incomplete.');

    const approved = await createSubmittedLoan(page, approvedEmail, 'Browser Approval');
    await apiLogin(page.request, 'sanction'); await page.goto('/dashboard/sanction');
    await filterLoans(page, approvedEmail);
    await reviewQueue.getByRole('link', { name: 'View loan for Browser Approval' }).click();
    await page.getByRole('button', { name: 'Approve loan', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard\/sanction\?status=APPLIED$/);
    await apiLogin(page.request, 'disbursement'); await page.goto('/dashboard/disbursement');
    await filterLoans(page, approvedEmail);
    const releaseQueue = page.getByRole('list', { name: 'Release queue' });
    await expect(releaseQueue.getByText('Browser Approval', { exact: true })).toBeVisible();
    await releaseQueue.getByRole('link', { name: 'View loan for Browser Approval' }).click();
    await expect(page.getByRole('heading', { name: 'Browser Approval', exact: true })).toBeVisible();
    await expect(page.getByText('PAN', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Salary slip', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Mark disbursed', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard\/disbursement\?status=SANCTIONED$/);
    await filterLoans(page, approvedEmail);
    await expect(page.getByText('No matching loans.')).toBeVisible();
    await login(page, approvedEmail); await page.goto(`/borrower/loans/${approved.loanId}`);
    await expect(page.getByText('Disbursed', { exact: true })).toHaveCount(2);
    await expectNoOverflow(page); await page.screenshot({ path: testInfo.outputPath('borrower-disbursed.png'), fullPage: true });
    expect(errors).toEqual([]);
  } finally { await cleanup([rejectedEmail, approvedEmail]); }
});

test('Admin queue navigation preserves filters through details, Back and refresh; stale actions recover', async ({ page }, testInfo) => {
  const email = `step7-${randomUUID()}@example.test`;
  try {
    const fixture = await createSubmittedLoan(page, email, 'Navigation and Conflicts');
    await apiLogin(page.request, 'admin');
    await page.goto('/dashboard/sales');
    const nav = page.getByRole('navigation', { name: 'Workspace' });
    await nav.getByRole('link', { name: 'Sanction', exact: true }).click();
    await filterLoans(page, email);
    const queueUrl = page.url();
    await page.getByRole('link', { name: 'View loan for Navigation and Conflicts' }).click();
    await page.getByRole('link', { name: 'Sanction queue', exact: true }).click();
    await expect(page).toHaveURL(queueUrl);
    await expect(page.getByRole('searchbox')).toHaveValue(email);
    await page.reload();
    await expect(page.getByRole('searchbox')).toHaveValue(email);
    await page.getByRole('link', { name: 'View loan for Navigation and Conflicts' }).click();
    await expect(page.getByRole('heading', { name: 'Navigation and Conflicts', exact: true })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/dashboard/sanction/${fixture.loanId}\\?`));
    await page.goBack();
    await expect(page.getByRole('searchbox')).toHaveValue(email);
    await page.goForward();
    await expect(page.getByRole('button', { name: 'Approve loan', exact: true })).toBeEnabled();
    expect((await page.request.post(`/api/v1/sanction/loans/${fixture.loanId}/decision`, { headers: mutationHeaders, data: { decision: 'APPROVE' } })).status()).toBe(200);
    await page.getByRole('button', { name: 'Approve loan', exact: true }).click();
    await expect(page.getByText('This decision is already recorded.')).toBeVisible();
    await expect(page.getByRole('main').getByRole('alert')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approve loan', exact: true })).toHaveCount(0);
    await nav.getByRole('link', { name: 'Disbursement', exact: true }).click();
    await filterLoans(page, email);
    await page.getByRole('link', { name: 'View loan for Navigation and Conflicts' }).click();
    await page.getByRole('link', { name: 'Disbursement queue', exact: true }).click();
    await expect(page.getByRole('searchbox')).toHaveValue(email);
    await page.getByRole('link', { name: 'View loan for Navigation and Conflicts' }).click();
    await expect(page.getByRole('button', { name: 'Mark disbursed', exact: true })).toBeEnabled();
    expect((await page.request.post(`/api/v1/disbursement/loans/${fixture.loanId}/disburse`, { headers: mutationHeaders })).status()).toBe(200);
    await page.getByRole('button', { name: 'Mark disbursed', exact: true }).click();
    await expect(page.getByText('This loan has already been disbursed.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mark disbursed', exact: true })).toHaveCount(0);
    await nav.getByRole('link', { name: 'Collection', exact: true }).click();
    await filterLoans(page, email);
    await page.getByRole('link', { name: 'View loan for Navigation and Conflicts' }).click();
    await page.getByRole('link', { name: 'Collection queue', exact: true }).click();
    await expect(page.getByRole('searchbox')).toHaveValue(email);
    expect((await page.getByRole('searchbox').boundingBox())!.width).toBeGreaterThanOrEqual(120);
    await expectNoOverflow(page);
    await page.screenshot({ path: testInfo.outputPath('admin-filtered-queue.png'), fullPage: true });
    await page.setViewportSize({ width: 320, height: 700 });
    expect((await page.getByRole('searchbox').boundingBox())!.width).toBeGreaterThanOrEqual(120);
    await expectNoOverflow(page);
    await page.screenshot({ path: testInfo.outputPath('admin-queue-320.png'), fullPage: true });
  } finally { await cleanup([email]); }
});

test('queue failure retries, forbidden responses and expired sessions have recoverable states', async ({ page, context }) => {
  await apiLogin(page.request, 'sanction');
  await page.goto('/dashboard/sanction');
  await expect(page.getByRole('button', { name: 'Refresh loans', exact: true })).toBeEnabled();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to main content', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('main')).toBeFocused();
  const queueApi = '**/api/v1/sanction/loans?*';
  let release!: () => void;
  const paused = new Promise<void>((resolve) => { release = resolve; });
  await page.route(queueApi, async (route) => { await paused; await route.fulfill({ status: 503, json: { error: { code: 'UNAVAILABLE', message: 'Please retry the queue.' } } }); });
  try {
    await page.getByRole('button', { name: 'Refresh loans', exact: true }).click();
    await expect(page.getByRole('region', { name: /^Loan review queue/ })).toHaveAttribute('aria-busy', 'true');
    await expect(page.getByRole('button', { name: 'Refresh loans', exact: true })).toBeDisabled();
  } finally { release(); }
  await expect(page.getByRole('main').getByRole('alert')).toHaveText('Please retry the queue.');
  await page.unroute(queueApi);
  await page.getByRole('button', { name: 'Refresh loans', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Refresh loans', exact: true })).toBeEnabled();
  await page.route(queueApi, (route) => route.fulfill({ status: 403, json: { error: { code: 'FORBIDDEN', message: 'Access denied.' } } }));
  await page.getByRole('button', { name: 'Refresh loans', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Access denied', exact: true })).toBeVisible();
  await page.unroute(queueApi);
  await page.goto('/dashboard/sanction');
  await expect(page.getByRole('button', { name: 'Refresh loans', exact: true })).toBeEnabled();
  await context.clearCookies();
  await page.getByRole('button', { name: 'Refresh loans', exact: true }).click();
  await expect(page).toHaveURL('/login?reason=session-expired');
  await expect(page.getByRole('status')).toHaveText('Your session has expired. Please sign in again.');
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
});
