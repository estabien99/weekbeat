import type { Lang } from '../core/index.ts';

export const LOCALE: Record<Lang, string> = { de: 'de-DE', en: 'en-GB' };

export function localeOf(lang: string | undefined): string {
  return lang === 'en' ? LOCALE.en : LOCALE.de;
}

/** Monday-first weekday names in the UI language. */
export function weekdayNames(lang: string | undefined, style: 'long' | 'short' = 'long'): string[] {
  const fmt = new Intl.DateTimeFormat(localeOf(lang), { weekday: style });
  // 5 Jan 2026 is a Monday.
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2026, 0, 5 + i)));
}
