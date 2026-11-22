/* global document, window */
import { expect, test } from '@playwright/test';

for (const width of [1440, 390]) {
  test('homepage navigation and FAQ at ' + width, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Less chasing.');
    const question = page.getByRole('button', { name: 'Who can help manage our wedding?' });
    await question.click();
    await expect(question).toHaveAttribute('aria-expanded', 'true');
    await page.getByRole('button', { name: 'Do guests need an account?' }).click();
    await expect(question).toHaveAttribute('aria-expanded', 'false');
    await page.getByRole('link', { name: 'Start planning', exact: true }).first().click();
    await expect(page).toHaveURL(/#availability$/);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: 'test-results/homepage-' + width + '.png', fullPage: true });
  });
}
