import { useTranslation } from 'react-i18next';
import { isoWeek, toIsoDate, weekOf, type Lang } from '../core/index.ts';
import { LANGS, setLang } from './i18n/index.ts';
import { PwaPrompt } from './PwaPrompt.tsx';

const LOCALE: Record<Lang, string> = { de: 'de-DE', en: 'en-GB' };

export function App() {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage ?? 'de') as Lang;
  const locale = LOCALE[lang];
  const now = new Date();
  const days = weekOf(now);
  const today = toIsoDate(now);
  const { week } = isoWeek(now);
  const dayFmt = new Intl.DateTimeFormat(locale, { weekday: 'long' });
  const dateFmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' });

  return (
    <>
      <header className="top">
        <div>
          <h1>{t('app.name')}</h1>
          <p className="muted">{t('app.tagline')}</p>
        </div>
        <label className="lang">
          <span className="sr-only">{t('settings.language')}</span>
          <select value={lang} onChange={(e) => setLang(e.target.value as Lang)} aria-label={t('settings.language')}>
            {LANGS.map((l) => (
              <option key={l} value={l}>
                {l === 'de' ? 'Deutsch' : 'English'}
              </option>
            ))}
          </select>
        </label>
      </header>

      <main>
        <section aria-labelledby="week-title">
          <div className="week-head">
            <h2 id="week-title">{t('week.title', { week })}</h2>
            <p className="muted">
              {t('week.range', { from: dateFmt.format(days[0]), to: dateFmt.format(days[6]) })}
            </p>
          </div>
          <ol className="week">
            {days.map((d) => {
              const iso = toIsoDate(d);
              const isToday = iso === today;
              return (
                <li key={iso} className={isToday ? 'day today' : 'day'} aria-current={isToday ? 'date' : undefined}>
                  <div className="day-head">
                    <span className="day-name">{dayFmt.format(d)}</span>
                    <span className="muted">{dateFmt.format(d)}</span>
                    {isToday && <span className="badge">{t('week.today')}</span>}
                  </div>
                  <p className="muted empty">{t('week.empty')}</p>
                </li>
              );
            })}
          </ol>
          <p className="hint">{t('week.hint')}</p>
        </section>
      </main>

      <footer className="muted">{t('footer.disclaimer')}</footer>
      <PwaPrompt />
    </>
  );
}
