import { test, expect } from '@playwright/test';
import { apiLogin } from './helpers';

test('live status uses the API proxy and refreshes without layout overflow', async ({ page, request }, testInfo) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const response = await request.get('/api/v1/health');
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ data: { status: 'ok', database: 'connected' } });

  await apiLogin(page.request);
  await page.goto('/status');
  await expect(page.getByRole('heading', { name: 'Service status', exact: true })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('All systems operational');
  const refreshed = page.waitForResponse((result) => result.url().endsWith('/api/v1/health') && result.request().method() === 'GET');
  await page.getByRole('button', { name: 'Refresh status' }).click();
  expect((await refreshed).status()).toBe(200);
  await expect(page.getByRole('button', { name: 'Refresh status' })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(pageErrors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('healthy.png'), fullPage: true });
});

test('unavailable status can recover through refresh', async ({ page }) => {
  await apiLogin(page.request);
  await page.route('**/api/v1/health', (route) => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: JSON.stringify({ error: { code: 'DEPENDENCY_UNAVAILABLE', message: 'The database is not ready.' } }),
  }));
  await page.goto('/status');
  await expect(page.getByRole('status')).toHaveText('Service interruption');
  await page.unroute('**/api/v1/health');
  await page.getByRole('button', { name: 'Refresh status' }).click();
  await expect(page.getByRole('status')).toHaveText('All systems operational');
});
