import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import de from '../app/i18n/de.json' with { type: 'json' };
import en from '../app/i18n/en.json' with { type: 'json' };

const T = { de, en } as const;
type Lang = keyof typeof T;

// Fixed clock so screenshots are stable: Wednesday 18 Nov 2026, 10:00 local.
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 10, 18, 10, 0));
});

/** WCAG 2.2 AA target: no automatically detectable violations. */
async function expectAccessible(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`)).toEqual(
    [],
  );
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

async function shot(page: Page, name: string, project: string, lang: Lang) {
  await page.screenshot({ path: `screenshots/${project}-${lang}-${name}.png`, fullPage: true });
}

for (const lang of ['de', 'en'] as const) {
  const t = T[lang];

  test.describe(lang, () => {
    test.use({ locale: lang === 'de' ? 'de-DE' : 'en-GB' });

    test(`setup, week and settings (${lang})`, async ({ page }, info) => {
      const project = info.project.name;
      await page.addInitScript((l) => localStorage.setItem('weekbeat.lang', l), lang);
      await page.goto('/');
      await expect(page.locator('html')).toHaveAttribute('lang', lang);

      // Step 1: household and first person
      await expect(page.getByRole('heading', { name: t.setup.title })).toBeVisible();
      await expectAccessible(page);
      await expectNoHorizontalScroll(page);
      await shot(page, '1-setup', project, lang);

      await page.getByRole('button', { name: t.common.next }).click();
      await expect(page.getByRole('alert')).toHaveText(t.errors.household);

      await page.getByLabel(t.setup.household).fill('Unser Nest');
      await page.getByLabel(t.profile.name).fill('Alex');
      await page.getByRole('button', { name: t.common.next }).click();

      // Step 2: availability
      await expect(
        page.getByRole('heading', { name: t.setup.availabilityTitle.replace('{{name}}', 'Alex') }),
      ).toBeVisible();
      await page.getByLabel(t.availability.day).selectOption('1');
      await page.getByRole('button', { name: t.common.add, exact: true }).click();
      await page.getByLabel(t.availability.day).selectOption('6');
      await page.getByLabel(t.availability.from).fill('09:00');
      await page.getByLabel(t.availability.to).fill('11:00');
      await page.getByRole('button', { name: t.common.add, exact: true }).click();
      await expect(page.locator('.windows li')).toHaveCount(2);
      await expectAccessible(page);
      await shot(page, '2-availability', project, lang);
      await page.getByRole('button', { name: t.setup.finish }).click();

      // Week view shows the free windows
      await expect(page.getByRole('heading', { level: 2 })).toHaveText(t.week.title.replace('{{week}}', '47'));
      await expect(page.locator('.day')).toHaveCount(7);
      await expect(page.locator('[aria-current="date"]')).toHaveCount(1);
      await expect(page.locator('.day').nth(0)).toContainText('18:00–19:30');
      await expect(page.locator('.day').nth(5)).toContainText('09:00–11:00');
      await expectAccessible(page);
      await expectNoHorizontalScroll(page);
      await shot(page, '3-week', project, lang);

      // Settings: add a second person, switch to them
      await page.getByRole('link', { name: t.nav.settings }).click();
      await page.getByRole('button', { name: t.settings.addPerson }).click();
      await page.getByLabel(t.profile.name).fill('Sam');
      await page.getByRole('button', { name: t.common.save }).click();
      await page.getByRole('button', { name: t.common.save }).click(); // times step, none added
      await expect(page.locator('.people li')).toHaveCount(2);
      await expectAccessible(page);
      await expectNoHorizontalScroll(page);
      await shot(page, '4-settings', project, lang);

      await page.getByLabel(t.nav.person).selectOption({ label: 'Sam' });
      await page.getByRole('link', { name: t.nav.week }).click();
      await expect(page.locator('.day').nth(0)).not.toContainText('18:00');

      // Data survives a reload (stored on the device)
      await page.reload();
      await expect(page.getByLabel(t.nav.person)).toHaveValue(/.+/);
      await expect(page.getByRole('heading', { name: t.setup.title })).toHaveCount(0);
    });
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
