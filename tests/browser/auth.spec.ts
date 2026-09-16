import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { SignJWT } from 'jose';
import mongoose from 'mongoose';
import { DEMO_PASSWORD } from '../../apps/api/src/modules/auth/seed-accounts';
import { apiLogin, browserOrigin, expectNoOverflow, mutationHeaders, uiLogin } from './helpers';

const accounts = [
  { role: 'admin', path: '/dashboard/sales', heading: 'Sales', modules: ['Sales', 'Sanction', 'Disbursement', 'Collection'] },
  { role: 'sales', path: '/dashboard/sales', heading: 'Sales', modules: ['Sales'] },
  { role: 'sanction', path: '/dashboard/sanction', heading: 'Sanction', modules: ['Sanction'] },
  { role: 'disbursement', path: '/dashboard/disbursement', heading: 'Disbursement', modules: ['Disbursement'] },
  { role: 'collection', path: '/dashboard/collection', heading: 'Collection', modules: ['Collection'] },
  { role: 'borrower', path: '/borrower', heading: 'Borrower portal', modules: [] },
];

test('authentication controls cannot submit credentials before JavaScript is ready', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto(`${browserOrigin}/login`);
    await expect(page.locator('form')).toHaveAttribute('method', 'post');
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeDisabled();
    await expect(page.getByLabel('Password', { exact: true })).toBeDisabled();
  } finally { await context.close(); }
});

test('anonymous pages redirect to sign in and invalid credentials show a recoverable error', async ({ page }, testInfo) => {
  for (const path of ['/', '/borrower', '/dashboard', '/dashboard/sales', '/dashboard/sanction', '/dashboard/disbursement', '/dashboard/collection', '/status', '/access-denied']) {
    await page.goto(path);
    await expect(page).toHaveURL('/login');
  }
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByLabel('Email address')).toHaveAttribute('aria-invalid', 'true');
  await page.getByLabel('Email address').fill('borrower@lms.example.test');
  await page.getByLabel('Password', { exact: true }).fill('WrongPassword!12');
  await page.getByRole('button', { name: 'Show password' }).click();
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Hide password' }).click();
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('form').getByRole('alert')).toHaveText('Email or password is incorrect.');
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
  await expectNoOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('login.png'), fullPage: true });
});

for (const account of accounts) {
  test(`${account.role} signs in, sees only permitted navigation, and cannot bypass page guards`, async ({ page, context }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await uiLogin(page, account.role);
    await expect(page).toHaveURL(account.path);
    await expect(page.getByRole('heading', { name: account.heading, exact: true })).toBeVisible();
    await expect(page.getByText(`${account.role}@lms.example.test`, { exact: true })).toBeVisible();
    const cookie = (await context.cookies()).find((cookie) => cookie.name === 'lms_session');
    expect(cookie?.httpOnly).toBe(true); expect(cookie?.sameSite).toBe('Lax');
    expect(await page.evaluate(() => document.cookie.includes('lms_session'))).toBe(false);
    const nav = page.getByRole('navigation', { name: 'Workspace' });
    for (const module of ['Sales', 'Sanction', 'Disbursement', 'Collection']) {
      await expect(nav.getByRole('link', { name: module, exact: true })).toHaveCount(account.modules.includes(module) ? 1 : 0);
    }
    await expectNoOverflow(page);
    await page.screenshot({ path: testInfo.outputPath(`${account.role}.png`), fullPage: true });
    await page.reload();
    await expect(page.getByText(`${account.role}@lms.example.test`, { exact: true })).toBeVisible();
    for (const module of ['Sales', 'Sanction', 'Disbursement', 'Collection']) {
      await page.goto(`/dashboard/${module.toLowerCase()}`);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(account.modules.includes(module) ? module : 'Access denied');
      await expectNoOverflow(page);
    }
    await page.goto('/borrower');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(account.role === 'borrower' ? 'Borrower portal' : 'Access denied');
    await page.goto('/');
    await expect(page).toHaveURL(account.path);
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page).toHaveURL('/login');
    expect((await context.cookies()).some((cookie) => cookie.name === 'lms_session')).toBe(false);
    await page.goto(account.path);
    await expect(page).toHaveURL('/login');
    expect(errors).toEqual([]);
  });
}

test('signup creates a borrower, rejects forged roles, and preserves a long email without overflow', async ({ page, request }, testInfo) => {
  const email = `browser-${randomUUID()}@${'long-domain-'.repeat(4)}example.test`;
  const forged = await request.post('/api/v1/auth/register', { headers: mutationHeaders, data: { email, password: DEMO_PASSWORD, role: 'ADMIN' } });
  expect(forged.status()).toBe(422);
  try {
    await page.goto('/register');
    await page.getByLabel('Email address').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(DEMO_PASSWORD);
    await page.getByLabel('Confirm password').fill('mismatched');
    await page.getByRole('button', { name: 'Create borrower account', exact: true }).click();
    await expect(page.locator('form').getByRole('alert')).toHaveText('Passwords do not match.');
    await page.getByLabel('Confirm password').fill(DEMO_PASSWORD);
    await page.getByRole('button', { name: 'Create borrower account', exact: true }).click();
    await expect(page).toHaveURL('/borrower');
    await expect(page.getByText(email, { exact: true })).toBeVisible();
    const me = await page.request.get('/api/v1/auth/me');
    expect(me.status()).toBe(200);
    expect((await me.json()).data.role).toBe('BORROWER');
    await expectNoOverflow(page);
    await page.screenshot({ path: testInfo.outputPath('new-borrower.png'), fullPage: true });
  } finally {
    const connection = await mongoose.createConnection(process.env.MONGODB_URI!).asPromise();
    try { await connection.collection('users').deleteOne({ email }); }
    finally { await connection.close(); }
  }
});

test('tampered and expired sessions cannot render protected pages', async ({ page, context }) => {
  await apiLogin(page.request);
  const me = await (await page.request.get('/api/v1/auth/me')).json();
  const now = Math.floor(Date.now() / 1000);
  const expired = await new SignJWT({}).setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(me.data.id).setIssuer('lms-api').setAudience('lms-web').setIssuedAt(now - 3601).setExpirationTime(now - 1)
    .sign(new TextEncoder().encode(process.env.JWT_SECRET!));
  for (const token of ['tampered-session', expired]) {
    await context.addCookies([{ name: 'lms_session', value: token, url: browserOrigin, httpOnly: true, sameSite: 'Lax' }]);
    await page.goto('/borrower');
    await expect(page).toHaveURL('/login');
    expect((await page.request.get('/api/v1/auth/me')).status()).toBe(401);
  }
});

test('signing out and changing roles does not restore the previous account through Back', async ({ page }) => {
  await uiLogin(page, 'admin');
  await expect(page).toHaveURL('/dashboard/sales');
  await page.getByRole('link', { name: 'Collection', exact: true }).click();
  await expect(page).toHaveURL('/dashboard/collection');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL('/login');
  await uiLogin(page, 'borrower');
  await expect(page).toHaveURL('/borrower');
  await page.goBack();
  await expect(page.getByText('admin@lms.example.test', { exact: true })).toHaveCount(0);
  await page.goto('/dashboard/collection');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Access denied');
});
