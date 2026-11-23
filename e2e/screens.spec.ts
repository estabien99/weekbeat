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
  // The transient "works offline" notice hides content in full-page shots; it closes by itself after 6 s.
  const close = page.locator('.toast').getByRole('button', { name: T[lang].pwa.close });
  if (await close.isVisible()) await close.click();
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
      await page.getByRole('button', { name: t.common.next, exact: true }).click();

      // Step 3: optional interview (hobbies, session length, automatic proposal)
      await expect(page.getByRole('heading', { name: t.setup.prefsTitle })).toBeVisible();
      const q1 = t.interview.hobbies.title.replace('{{name}}', 'Alex');
      await expect(page.getByRole('heading', { name: q1 })).toBeFocused();
      const mtb = lang === 'de' ? 'Mountainbiken' : 'Mountain biking';
      await page.getByRole('checkbox', { name: mtb }).check();
      await page.getByRole('checkbox', { name: 'Yoga', exact: true }).check();
      await expectAccessible(page);
      await expectNoHorizontalScroll(page);
      await shot(page, '3-interview', project, lang);
      await page.getByRole('button', { name: t.common.next, exact: true }).click();
      await expect(page.getByRole('heading', { name: t.interview.length.title })).toBeFocused();
      await page.getByLabel(t.profile.sessionMin).fill('45');
      await page.getByRole('button', { name: t.common.next, exact: true }).click();
      // Membership question: provider list with names only; details appear once a provider is chosen.
      await expect(
        page.getByRole('heading', { name: t.interview.membership.title.replace('{{name}}', 'Alex') }),
      ).toBeFocused();
      await page.getByLabel(t.membership.provider).selectOption({ label: 'Wellpass' });
      await page.getByLabel(t.membership.share).fill('-3');
      await page.getByRole('button', { name: t.common.next, exact: true }).click();
      await expect(page.getByRole('alert')).toHaveText(t.errors.monthlyCostShareEur);
      await page.getByLabel(t.membership.share).fill('0');
      await expectAccessible(page);
      await expectNoHorizontalScroll(page);
      await shot(page, '3b-membership', project, lang);
      await page.getByRole('button', { name: t.common.next, exact: true }).click();
      // Freeletics Coach: weights need a place; there is none yet, so Alex answers "no" for now.
      await expect(
        page.getByRole('heading', { name: t.interview.coach.title.replace('{{name}}', 'Alex') }),
      ).toBeFocused();
      await page.getByRole('radio', { name: t.coach.yes }).check();
      await page.getByLabel(t.coach.daysPerWeek).fill('2');
      await page.getByRole('radio', { name: t.coach.kinds.weighted }).check();
      await expect(page.getByText(t.coach.noPlaces)).toBeVisible();
      await page.getByRole('button', { name: t.common.next, exact: true }).click();
      await expect(page.getByRole('alert')).toHaveText(t.errors.programmePlaces);
      await expectAccessible(page);
      await expectNoHorizontalScroll(page);
      await shot(page, '3c-coach', project, lang);
      await page.getByRole('radio', { name: t.coach.no }).check();
      await page.getByRole('button', { name: t.common.next, exact: true }).click();
      await page.getByRole('radio', { name: t.interview.auto.yes }).check();
      await expectAccessible(page);
      await page.getByRole('button', { name: t.interview.finish }).click();

      // Week view shows the free windows and, with automatic proposals on, the proposal right away
      await expect(page.getByRole('heading', { level: 2 })).toHaveText(t.week.title.replace('{{week}}', '47'));
      await expect(page.locator('.day')).toHaveCount(7);
      await expect(page.locator('[aria-current="date"]')).toHaveCount(1);
      await expect(page.locator('.day').nth(0)).toContainText('18:00–19:30');
      await expect(page.locator('.day').nth(5)).toContainText('09:00–11:00');
      // Wednesday 10:00: only Saturday's window is left; nothing is proposed in the past.
      const proposed = page.locator('.session.proposed');
      await expect(proposed).toHaveCount(2);
      await expect(page.locator('.day').nth(5).locator('.session.proposed')).toHaveCount(2);
      await expect(proposed.first().locator('.why')).not.toBeEmpty();
      await expect(page.locator('.notes')).toContainText(lang === 'de' ? '2 von 3' : '2 of 3');
      await expectAccessible(page);
      await expectNoHorizontalScroll(page);
      await shot(page, '4-week', project, lang);

      await page.getByRole('button', { name: t.plan.acceptAll }).click();
      await expect(
        page.getByRole('status').filter({ hasText: t.plan.accepted_other.replace('{{count}}', '2') }),
      ).toBeVisible();
      await expect(page.locator('.session.accepted')).toHaveCount(2);
      await expect(proposed).toHaveCount(0);

      // Moving a session offers alternatives (keyboard and screen-reader friendly, no drag and drop)
      await page.locator('.session.accepted').first().getByRole('button', { name: t.plan.move }).click();
      await expect(page.getByRole('heading', { name: t.plan.replanTitle })).toBeFocused();
      await expectAccessible(page);
      await shot(page, '4b-replan', project, lang);
      const letGo = lang === 'de' ? 'Diesmal auslassen – kein Problem.' : 'Let it go this time – no problem.';
      await page.getByRole('button', { name: letGo }).click();
      await expect(page.getByRole('status').filter({ hasText: t.plan.saved })).toBeVisible();
      await expect(page.locator('.session.accepted')).toHaveCount(1);

      // Settings: add a second person, switch to them
      await page.getByRole('link', { name: t.nav.settings }).click();
      await page.getByRole('button', { name: t.settings.addPerson }).click();
      await page.getByLabel(t.profile.name).fill('Sam');
      await page.getByLabel(t.profile.sessionMin).fill('0');
      await page.getByRole('button', { name: t.common.save }).click();
      await expect(page.getByRole('alert')).toHaveText(t.errors.sessionMin);
      await page.getByLabel(t.profile.sessionMin).fill('45');
      await page.getByRole('button', { name: t.common.save }).click();
      await page.getByRole('button', { name: t.common.save }).click(); // times step, none added
      // A new person is offered the interview too; Sam leaves it for later.
      await expect(
        page.getByRole('heading', { name: t.interview.hobbies.title.replace('{{name}}', 'Sam') }),
      ).toBeFocused();
      await page.getByRole('button', { name: t.common.cancel }).click();
      await expect(page.locator('.people li')).toHaveCount(2);
      await expect(page.locator('.people li').nth(0)).toContainText(t.profile.autoPlanOn);
      await expect(page.locator('.people li').nth(1)).toContainText(
        t.profile.sessionMinSummary.replace('{{count}}', '45'),
      );
      await expectAccessible(page);
      await expectNoHorizontalScroll(page);
      await shot(page, '5-settings', project, lang);

      // Export, then import the same file again (replaces data after confirmation)
      const downloadP = page.waitForEvent('download');
      await page.getByRole('button', { name: t.data.export }).click();
      const download = await downloadP;
      expect(download.suggestedFilename()).toBe('weekbeat-2026-11-18.json');
      const file = await download.path();
      await page.getByLabel(t.data.import).setInputFiles(file);
      await expect(page.getByRole('alertdialog')).toContainText(t.data.confirmText);
      await expectAccessible(page);
      await shot(page, '6-import', project, lang);
      await page.getByRole('button', { name: t.data.confirm }).click();
      await expect(page.getByRole('status').filter({ hasText: t.data.imported })).toBeVisible();
      await expect(page.locator('.people li')).toHaveCount(2);

      // A wrong file is refused with a clear message
      await page
        .getByLabel(t.data.import)
        .setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"a":1}') });
      await expect(page.getByRole('alert')).toHaveText(t.data.errors['not-weekbeat']);

      // Places: Sam gets a Plus 1 linked to Alex's Wellpass, then a partner place covered by both
      await page.getByRole('link', { name: t.nav.places }).click();
      await expect(page.getByRole('heading', { name: t.places.title, level: 2 })).toBeVisible();
      await expect(page.locator('.people li')).toHaveCount(1);
      await page.getByRole('button', { name: t.membership.add }).click();
      await expect(page.getByRole('heading', { name: t.membership.add, level: 4 })).toBeFocused();
      await page.getByLabel(t.membership.owner).selectOption({ label: 'Sam' });
      await page.getByLabel(t.membership.provider).selectOption({ label: 'Wellpass' });
      await page
        .getByLabel(t.membership.linkedTo.replace('{{addOn}}', 'Plus 1'))
        .selectOption({ label: 'Wellpass (Alex)' });
      // The provider's own facts, with a source: for a Plus 1 including the monthly check-in limit from 2027.
      await expect(page.getByRole('complementary', { name: t.membership.factsTitle })).toContainText('2027');
      await expectAccessible(page);
      await shot(page, '7a-plus1', project, lang);
      await page.getByLabel(t.membership.share).fill('25');
      await page.getByRole('button', { name: t.common.save }).click();
      await expect(page.getByRole('status').filter({ hasText: t.common.saved })).toBeVisible();
      await expect(page.locator('.people li')).toHaveCount(2);
      await expect(page.locator('.people li').nth(1)).toContainText('Wellpass Plus 1 (Sam)');

      await page.getByRole('button', { name: t.places.add }).click();
      await page.getByLabel(t.places.name, { exact: true }).fill('Studio Nord');
      // Ticking the main membership also ticks its Plus 1 (explicit coverage, can be unticked).
      await page.getByRole('checkbox', { name: 'Wellpass (Alex)' }).check();
      await expect(page.getByRole('checkbox', { name: 'Wellpass Plus 1 (Sam)' })).toBeChecked();
      await page.getByRole('checkbox', { name: t.activityCategories.strength }).check();
      await page.getByLabel(t.places.equipment).fill('Kettlebells, Langhantel');
      await page.getByLabel(t.places.price).fill('15,50');
      await page.getByLabel(t.places.bookingUrl).fill('http://example.org');
      await page.getByRole('button', { name: t.common.save }).click();
      await expect(page.getByRole('alert')).toHaveText(t.errors.bookingUrl);
      await page.getByLabel(t.places.bookingUrl).fill('https://example.org');
      await expectAccessible(page);
      await page.getByRole('button', { name: t.common.save }).click();
      await expect(page.locator('.places li')).toHaveCount(1);
      await expect(page.locator('.places li')).toContainText('Wellpass Plus 1 (Sam)');
      await expect(page.locator('.places li')).toContainText(lang === 'de' ? '15,50' : '15.50');
      await expectAccessible(page);
      await expectNoHorizontalScroll(page);
      await shot(page, '7-places', project, lang);

      // The Plus 1 shows the provider's monthly limit from 2027 (sourced, applied by the planner from then on).
      await expect(page.locator('.people li').nth(1)).toContainText('10');
      await expect(page.locator('.people li').nth(1)).toContainText('2027');

      // Check-in tap (Alex): logs the visit on this device; the value meter shows what it was worth.
      await page.getByRole('button', { name: t.checkIn.open.replace('{{name}}', 'Studio Nord') }).click();
      await expect(
        page.getByRole('heading', {
          name: t.checkIn.title.replace('{{place}}', 'Studio Nord').replace('{{name}}', 'Alex'),
        }),
      ).toBeFocused();
      await page.getByLabel(t.checkIn.duration).fill('45');
      await expectAccessible(page);
      await page.getByRole('button', { name: t.checkIn.save, exact: true }).click();
      await expect(
        page.getByRole('status').filter({ hasText: t.checkIn.done.replace('{{name}}', 'Studio Nord') }),
      ).toBeVisible();
      const meter = page.locator('.value-meter');
      await expect(meter.locator('dd').first()).toHaveText('1');
      await expect(meter).toContainText(lang === 'de' ? '15,50' : '15.50');
      await expectAccessible(page);
      await expectNoHorizontalScroll(page);
      await shot(page, '8-value', project, lang);

      // Alex adds the Coach plan in Settings: weights at Studio Nord, Coach set to Monday and Thursday.
      await page.getByRole('link', { name: t.nav.settings }).click();
      await page.getByRole('button', { name: t.settings.editPrefs.replace('{{name}}', 'Alex') }).click();
      for (let i = 0; i < 3; i++) await page.getByRole('button', { name: t.common.next, exact: true }).click();
      await page.getByRole('radio', { name: t.coach.yes }).check();
      await expect(page.getByLabel(t.coach.durationMin)).toHaveValue('45');
      await page.getByLabel(t.coach.daysPerWeek).fill('2');
      await page.getByRole('radio', { name: t.coach.kinds.weighted }).check();
      await page.getByRole('checkbox', { name: 'Studio Nord' }).check();
      const [mon, , , thu] = lang === 'de' ? ['Montag', '', '', 'Donnerstag'] : ['Monday', '', '', 'Thursday'];
      await page.getByRole('checkbox', { name: mon, exact: true }).check();
      await page.getByRole('checkbox', { name: thu, exact: true }).check();
      await expectAccessible(page);
      await page.getByRole('button', { name: t.common.next, exact: true }).click();
      await page.getByRole('button', { name: t.interview.finish }).click();

      // Next week: the Coach sessions go to Studio Nord, and the card says what to set in the Coach.
      await page.getByRole('link', { name: t.nav.week }).click();
      await page.getByRole('button', { name: t.plan.nextWeek }).click();
      await page.getByRole('button', { name: t.plan.make }).click();
      const coachCard = page.locator('.card.coach');
      await expect(coachCard).toContainText('Studio Nord');
      await expect(coachCard.locator('li')).toHaveCount(2);
      await expectAccessible(page);
      await expectNoHorizontalScroll(page);
      await shot(page, '9-coach', project, lang);

      // Game card (this week): Alex's check-in counts toward the weekly goal; level and streak start quietly.
      await page.getByRole('button', { name: t.plan.thisWeek }).click();
      const game = page.locator('.card.game');
      await expect(game.getByRole('heading', { name: t.game.title.replace('{{name}}', 'Alex') })).toBeVisible();
      await expect(game).toContainText(t.game.ofTarget.replace('{{done}}', '1').replace('{{target}}', '3'));
      await game.scrollIntoViewIfNeeded();
      await expectAccessible(page);
      await expectNoHorizontalScroll(page);
      await expect(game.locator('.badges')).toContainText(t.game.badges['first-session']);
      await expect(game.locator('.quests progress').first()).toBeVisible();
      await shot(page, '10-game', project, lang);

      // Settings: the household plays together; the week view then shows the shared line.
      await page.getByRole('link', { name: t.nav.settings }).click();
      await page.getByRole('radio', { name: t.settings.game.modes.cooperative }).check();
      await expect(page.getByRole('checkbox', { name: 'Sam' })).toBeChecked();
      await page.getByRole('heading', { name: t.settings.game.title }).scrollIntoViewIfNeeded();
      await expectAccessible(page);
      await expectNoHorizontalScroll(page);
      await shot(page, '11-game-settings', project, lang);
      await page.getByRole('link', { name: t.nav.week }).click();
      await expect(page.locator('.card.game')).toContainText(
        t.game.household.replace('{{met}}', '0').replace('{{active}}', '2'),
      );

      await page.getByLabel(t.nav.person).selectOption({ label: 'Sam' });
      await page.getByRole('link', { name: t.nav.week }).click();
      await expect(page.locator('.day').nth(0)).not.toContainText('18:00');
      // Sam skipped the interview: no automatic proposal; planning by hand explains what is missing.
      await expect(page.locator('.session')).toHaveCount(0);
      await page.getByRole('button', { name: t.plan.make }).click();
      await expect(page.locator('.notes')).toBeVisible();
      await expect(page.getByRole('button', { name: t.plan.remake })).toBeVisible();

      // Data survives a reload (stored on the device)
      await page.reload();
      await expect(page.getByLabel(t.nav.person)).toHaveValue(/.+/);
      await expect(page.getByRole('heading', { name: t.setup.title })).toHaveCount(0);
    });
  });
}

test('has a Content-Security-Policy and no violations', async ({ page }) => {
  const violations: string[] = [];
  page.on('console', (m) => {
    if (/Content Security Policy|Content-Security-Policy/i.test(m.text())) violations.push(m.text());
  });
  await page.goto('/');
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(csp).toContain("script-src 'self'");
  expect(csp).toContain("object-src 'none'");
  await expect(page.getByRole('heading', { level: 2 })).toBeVisible();
  // The service worker registers under the policy.
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(1);
  expect(violations).toEqual([]);
});

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
