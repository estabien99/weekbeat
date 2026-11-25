import { expect, test, type Page } from '@playwright/test';

/**
 * WCAG 2.2 2.4.11 Focus Not Obscured (Minimum): "When a user interface component receives keyboard focus,
 * the component is not entirely hidden due to author-created content."
 * The only author-created overlay is the fixed notice at the bottom (`.toast`).
 */
async function focusedIsHidden(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body || el.closest('.toast')) return null;
    const r = el.getBoundingClientRect();
    const left = Math.max(r.left, 0);
    const right = Math.min(r.right, window.innerWidth);
    const top = Math.max(r.top, 0);
    const bottom = Math.min(r.bottom, window.innerHeight);
    if (right <= left || bottom <= top) return null; // off screen: not this criterion's case
    // Sample a grid; if no point reaches the element, it is entirely hidden.
    for (let x = left + 1; x < right; x += Math.max(1, (right - left - 2) / 4))
      for (let y = top + 1; y < bottom; y += Math.max(1, (bottom - top - 2) / 4)) {
        const hit = document.elementFromPoint(x, y);
        if (hit && (hit === el || el.contains(hit) || hit.contains(el))) return null;
      }
    return el.outerHTML.slice(0, 120);
  });
}

for (const lang of ['de', 'en'] as const) {
  test(`notice never hides the focused control (${lang})`, async ({ page }) => {
    await page.addInitScript((l) => localStorage.setItem('weekbeat.lang', l), lang);
    await page.goto('/');
    // The "works offline" notice shows on the first visit and closes itself after 6 s.
    await expect(page.locator('.toast')).toBeVisible();
    const hidden: string[] = [];
    for (let i = 0; i < 30 && (await page.locator('.toast').isVisible()); i++) {
      await page.keyboard.press('Tab');
      const h = await focusedIsHidden(page);
      if (h) hidden.push(h);
    }
    expect(hidden).toEqual([]);
  });
}
