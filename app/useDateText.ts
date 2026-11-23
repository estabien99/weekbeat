import { useTranslation } from 'react-i18next';
import type { Lang } from '../core/index.ts';
import { localeOf } from './format.ts';

/** Formats YYYY-MM-DD as a local date in the UI language. */
export function useDateText(): (iso: string) => string {
  const { i18n } = useTranslation();
  const fmt = new Intl.DateTimeFormat(localeOf(i18n.resolvedLanguage as Lang), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return (iso) => fmt.format(new Date(`${iso}T12:00`));
}
