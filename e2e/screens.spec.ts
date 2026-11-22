import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Fixed clock so screenshots are stable: Wednesday 18 Nov 2026, 10:00 local.
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 10, 18, 10, 0));
});

for (const lang of ['de', 'en'] as const) {
  test(`week view (${lang})`, async ({ page }, info) => {
    await page.addInitScript((l) => localStorage.setItem('weekbeat.lang', l), lang);
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', lang);
    await expect(page.getByRole('heading', { level: 2 })).toHaveText(lang === 'de' ? 'KW 47' : 'Week 47');
    await expect(page.locator('.day')).toHaveCount(7);
    await expect(page.locator('[aria-current="date"]')).toHaveCount(1);

    // No horizontal scroll at any width.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);

    // WCAG 2.2 AA target: no automatically detectable violations.
    const a11y = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(a11y.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);

    await page.screenshot({ path: `screenshots/${info.project.name}-${lang}.png`, fullPage: true });
  });
}

test('is installable: manifest is linked and valid', async ({ page, request }) => {
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBeTruthy();
  const res = await request.get(href!);
  expect(res.ok()).toBe(true);
  const manifest = await res.json();
  expect(manifest.name).toContain('Weekbeat');
  expect(manifest.lang).toBe('de');
  expect(manifest.icons.some((i: { sizes: string }) => i.sizes === '512x512')).toBe(true);
});
