import { randomUUID } from 'node:crypto';
import { readFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import mongoose from 'mongoose';
import { DEMO_PASSWORD } from '../../apps/api/src/modules/auth/seed-accounts';
import { pdf, png, sizedPdf } from '../../apps/api/tests/document-fixtures';
import { apiLogin, expectNoOverflow, mutationHeaders } from './helpers';

test.setTimeout(60000);
async function start(page: Page, email: string) {
  const registered = await page.request.post('/api/v1/auth/register', { headers: mutationHeaders, data: { email, password: DEMO_PASSWORD } });
  expect(registered.status()).toBe(201);
  const draft = await page.request.post('/api/v1/borrower/applications', { headers: mutationHeaders });
  expect(draft.status()).toBe(201);
  const id = (await draft.json()).data.id as string;
  await page.goto(`/borrower/applications/${id}`);
  await expect(page.getByLabel('Full name', { exact: true })).toBeEnabled();
  return id;
}
async function eligible(page: Page) {
  await page.getByLabel('Full name', { exact: true }).fill('Synthetic Step Five');
  await page.getByLabel('PAN', { exact: true }).fill('ABCDE1234F');
  await page.getByLabel('Date of birth', { exact: true }).fill('1995-06-15');
  await page.getByLabel('Monthly salary (INR)').fill('25000');
  await page.getByLabel('Employment mode', { exact: true }).selectOption('SELF_EMPLOYED');
  await page.getByRole('button', { name: 'Save and check' }).click();
  await expect(page.getByText('Draft saved.', { exact: true })).toBeVisible();
}
async function cleanup(email: string) {
  expect(email).toMatch(/^step5-[a-f\d-]+@example\.test$/);
  const connection = await mongoose.createConnection(process.env.MONGODB_URI!).asPromise();
  try {
    const user = await connection.collection('users').findOne({ email });
    if (!user) return;
    const files = await connection.collection('documents').find({ borrowerId: user._id }).toArray();
    expect(await connection.collection('loans').countDocuments({ borrowerId: user._id })).toBe(0);
    const root = resolve(process.cwd(), process.env.UPLOAD_DIR ?? 'storage/uploads');
    for (const file of files) {
      expect(file.storageKey).toMatch(/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}\.(pdf|jpg|png)$/);
      await unlink(resolve(root, file.storageKey)).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; });
    }
    await connection.collection('documents').deleteMany({ borrowerId: user._id });
    await connection.collection('applications').deleteMany({ borrowerId: user._id });
    await connection.collection('users').deleteOne({ _id: user._id, email });
  } finally { await connection.close(); }
}
test('eligible borrower uploads, downloads, replaces and resumes a salary slip without overflow', async ({ page }, testInfo) => {
  const email = `step5-${randomUUID()}@example.test`;
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  try {
    const id = await start(page, email);
    const section = page.getByRole('region', { name: 'Salary slip', exact: true });
    const picker = page.locator('#salary-slip-file');
    await expect(picker).toBeDisabled();
    await eligible(page); await expect(picker).toBeEnabled();
    await picker.setInputFiles({ name: 'synthetic-salary.pdf', mimeType: 'application/pdf', buffer: pdf });
    await section.getByRole('button', { name: 'Upload salary slip', exact: true }).click();
    await expect(section.getByRole('status')).toHaveText('Salary slip uploaded.');
    const old = (await (await page.request.get(`/api/v1/borrower/applications/${id}`)).json()).data.salarySlip.id as string;
    const downloadPromise = page.waitForEvent('download');
    await section.getByRole('button', { name: 'Download salary slip' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('synthetic-salary.pdf');
    expect(await readFile((await download.path())!)).toEqual(pdf);
    const longName = `${'synthetic-long-filename-'.repeat(7)}.png`;
    await picker.setInputFiles({ name: longName, mimeType: 'image/png', buffer: png });
    const replacementResponse = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith(`/applications/${id}/salary-slip`));
    await section.getByRole('button', { name: 'Replace salary slip', exact: true }).click();
    const replaced = await replacementResponse;
    expect(replaced.status(), await replaced.text()).toBe(201);
    await expect(section.getByRole('status')).toHaveText('Salary slip replaced.');
    expect((await page.request.get(`/api/v1/documents/${old}`)).status()).toBe(404);
    await page.reload();
    await expect(section.getByText(longName, { exact: true })).toBeVisible();
    await expect(picker).toBeEnabled();
    await expectNoOverflow(page);
    await page.screenshot({ path: testInfo.outputPath('salary-slip-uploaded.png'), fullPage: true });
    await page.getByLabel('Monthly salary (INR)').fill('1'); await expect(picker).toBeDisabled();
    await page.getByRole('button', { name: 'Save and check' }).click();
    await expect(page.getByRole('region', { name: 'Eligibility result' }).getByRole('status')).toHaveText('Not eligible');
    await expect(picker).toBeDisabled();
    await expect(section.getByRole('button', { name: 'Download salary slip' })).toBeEnabled();
    expect(errors).toEqual([]);
  } finally { await cleanup(email); }
});
test('file validation, service failure retry and download errors preserve the selected or current file', async ({ page }, testInfo) => {
  const email = `step5-${randomUUID()}@example.test`;
  try {
    const id = await start(page, email); await eligible(page);
    const section = page.getByRole('region', { name: 'Salary slip', exact: true });
    const picker = page.locator('#salary-slip-file');
    await picker.setInputFiles({ name: 'too-large.pdf', mimeType: 'application/pdf', buffer: sizedPdf(5_000_001) });
    await expect(section.getByRole('alert')).toHaveText('The maximum file size is 5,000,000 bytes.');
    await expect(section.getByRole('button', { name: 'Upload salary slip', exact: true })).toBeDisabled();
    await section.getByRole('button', { name: 'Clear selected file' }).click();
    await picker.setInputFiles({ name: 'disguised.pdf', mimeType: 'application/pdf', buffer: png });
    await section.getByRole('button', { name: 'Upload salary slip', exact: true }).click();
    await expect(section.getByRole('alert')).toContainText('must match PDF, JPG or PNG');
    await expect(picker).toBeEnabled();
    await picker.setInputFiles({ name: 'retry.pdf', mimeType: 'application/pdf', buffer: pdf });
    const uploadPath = `**/api/v1/borrower/applications/${id}/salary-slip`;
    await page.route(uploadPath, (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'DOCUMENT_UNAVAILABLE', message: 'Storage temporarily unavailable.' } }) }));
    await section.getByRole('button', { name: 'Upload salary slip', exact: true }).click();
    await expect(section.getByRole('alert')).toHaveText('Storage temporarily unavailable.');
    await expect(section.getByText(/retry.pdf \(/)).toBeVisible();
    await expect(section.getByRole('button', { name: 'Upload salary slip', exact: true })).toBeEnabled();
    await page.unroute(uploadPath);
    await section.getByRole('button', { name: 'Upload salary slip', exact: true }).click();
    await expect(section.getByRole('status')).toHaveText('Salary slip uploaded.');
    await page.route('**/api/v1/documents/*', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'DOCUMENT_UNAVAILABLE', message: 'The document storage is unavailable. Please retry.' } }) }));
    await section.getByRole('button', { name: 'Download salary slip' }).click();
    await expect(section.getByRole('alert')).toContainText('document storage is unavailable');
    await expect(section.getByText('retry.pdf', { exact: true })).toBeVisible();
    await expectNoOverflow(page); await page.screenshot({ path: testInfo.outputPath('salary-slip-retry.png'), fullPage: true });
  } finally { await cleanup(email); }
});
test('same-origin proxy accepts exact 5 MB, rejects an extra byte, and enforces staff permissions', async ({ page }) => {
  const email = `step5-${randomUUID()}@example.test`;
  try {
    const id = await start(page, email); await eligible(page);
    const path = `/api/v1/borrower/applications/${id}/salary-slip`;
    const allowed = await page.request.post(path, { headers: mutationHeaders, multipart: { file: { name: 'maximum.pdf', mimeType: 'application/pdf', buffer: sizedPdf(5_000_000) } } });
    expect(allowed.status()).toBe(201);
    const document = (await allowed.json()).data;
    expect(document.sizeBytes).toBe(5_000_000);
    const rejected = await page.request.post(path, { headers: mutationHeaders, multipart: { file: { name: 'oversized.pdf', mimeType: 'application/pdf', buffer: sizedPdf(5_000_001) } } });
    expect(rejected.status()).toBe(413); expect((await rejected.json()).error.code).toBe('FILE_TOO_LARGE');
    expect((await (await page.request.get(`/api/v1/documents/${document.id}`)).body()).length).toBe(5_000_000);
    for (const role of ['sales', 'sanction', 'admin', 'disbursement', 'collection']) {
      await apiLogin(page.request, role);
      expect((await page.request.get(`/api/v1/documents/${document.id}`)).status()).toBe(['sanction', 'admin'].includes(role) ? 404 : 403);
      expect((await page.request.post(path, { headers: mutationHeaders, multipart: { file: { name: 'synthetic.pdf', mimeType: 'application/pdf', buffer: pdf } } })).status()).toBe(403);
    }
  } finally { await cleanup(email); }
});
