import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { DEMO_PASSWORD } from '../../apps/api/src/modules/auth/seed-accounts';

export const browserOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
export const mutationHeaders = { Origin: browserOrigin, 'X-LMS-Request': '1' };
export async function apiLogin(request: APIRequestContext, role = 'borrower') {
  const response = await request.post('/api/v1/auth/login', {
    headers: mutationHeaders, data: { email: `${role}@lms.example.test`, password: DEMO_PASSWORD },
  });
  expect(response.status()).toBe(200);
}
export async function uiLogin(page: Page, role: string) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(`${role}@lms.example.test`);
  await page.getByLabel('Password', { exact: true }).fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}
export async function expectNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}
