import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { expect, test } from '@playwright/test';
import { DEMO_PASSWORD } from '../../apps/api/src/modules/auth/seed-accounts';
import { expectNoOverflow, mutationHeaders } from './helpers';

test('server-render failure retries fresh data after the service recovers', async ({ page }, testInfo) => {
  const email = `step10-${randomUUID()}@example.test`;
  const brokenEmail = `invalid-${randomUUID()}`;
  const connection = await mongoose.createConnection(process.env.MONGODB_URI!).asPromise();
  try {
    const response = await page.request.post('/api/v1/auth/register', { headers: mutationHeaders, data: { email, password: DEMO_PASSWORD } });
    expect(response.status()).toBe(201);
    const id = new mongoose.Types.ObjectId((await response.json()).data.id as string);
    expect((await connection.collection('users').updateOne({ _id: id, email }, { $set: { email: brokenEmail } })).modifiedCount).toBe(1);
    await page.goto('/borrower');
    await expect(page.getByRole('heading', { name: 'Temporarily unavailable', exact: true })).toBeVisible();
    await expect(page.getByText('We could not load this page. Please try again.', { exact: true })).toBeVisible();
    await expectNoOverflow(page);
    await page.screenshot({ path: testInfo.outputPath('recoverable-page-error.png'), fullPage: true });
    expect((await connection.collection('users').updateOne({ _id: id, email: brokenEmail }, { $set: { email } })).modifiedCount).toBe(1);
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Borrower portal', exact: true })).toBeVisible();
    await expect(page.getByText(email, { exact: true })).toBeVisible();
  } finally {
    expect(email).toMatch(/^step10-[a-f\d-]+@example\.test$/);
    await connection.collection('users').deleteMany({ email: { $in: [email, brokenEmail] } });
    await connection.close();
  }
});
