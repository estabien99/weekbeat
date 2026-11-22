import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import de from './de.json';
import en from './en.json';
import type { Lang } from '../../core/index.ts';

export const LANGS: Lang[] = ['de', 'en'];
const KEY = 'weekbeat.lang';

// German first: German unless the browser prefers English or the user chose English.
function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'de' || saved === 'en') return saved;
  } catch {
    /* storage blocked: fall through */
  }
  return navigator.language?.toLowerCase().startsWith('en') ? 'en' : 'de';
}

export function setLang(lang: Lang): void {
  void i18n.changeLanguage(lang);
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    /* per-device convenience only */
  }
}

i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng;
});

void i18n.use(initReactI18next).init({
  resources: { de: { translation: de }, en: { translation: en } },
  lng: initialLang(),
  fallbackLng: 'de',
  supportedLngs: LANGS,
  interpolation: { escapeValue: false },
});

export default i18n;
