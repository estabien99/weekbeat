import { expect, test } from '@playwright/test';
import de from '../app/i18n/de.json' with { type: 'json' };
import en from '../app/i18n/en.json' with { type: 'json' };

const T = { de, en } as const;

/**
 * WCAG 2.2 2.2.1 Timing Adjustable. Understanding 2.2.1, on a message that disappears: content on a timer
 * "does not need to be time adjustable" only "if there is an alternative that does not rely on a timer".
 * Nothing else in the app says that it works offline, so the notice stays until the person closes it.
 */
for (const lang of ['de', 'en'] as const) {
  test(`offline notice stays until closed (${lang})`, async ({ page }) => {
    const t = T[lang];
    await page.clock.install();
    await page.addInitScript((l) => localStorage.setItem('weekbeat.lang', l), lang);
    await page.goto('/');
    const notice = page.getByRole('status').filter({ hasText: t.pwa.offline });
    await expect(notice).toBeVisible();
    await page.clock.runFor(10 * 60_000);
    await expect(notice).toBeVisible();
    await notice.getByRole('button', { name: t.pwa.close }).click();
    await expect(notice).toHaveCount(0);
  });
}
