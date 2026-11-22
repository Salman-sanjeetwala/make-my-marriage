import { expect, test } from '@playwright/test';

test('Angular boots and reaches the real API through its development proxy', async ({
  page,
  request,
}) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const healthResponse = page.waitForResponse('http://localhost:4200/api/health');
  await page.goto('/health');

  const response = await healthResponse;
  expect(response.request().method()).toBe('GET');
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ data: { status: 'ok' } });
  await expect(page.getByRole('status')).toHaveText('Connected successfully.');

  const retryResponse = page.waitForResponse('http://localhost:4200/api/health');
  await page.getByRole('button', { name: 'Check again' }).click();
  expect((await retryResponse).status()).toBe(200);
  await expect(page.getByRole('status')).toHaveText('Connected successfully.');
  expect(pageErrors).toEqual([]);

  const missing = await request.get('/api/not-a-route');
  expect(missing.status()).toBe(404);
  expect(missing.headers()['content-type']).toContain('application/json');
});
