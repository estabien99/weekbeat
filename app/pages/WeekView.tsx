import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslation } from 'react-i18next';
import { getAvailability, isoWeek, isoWeekday, toIsoDate, weekOf, type Profile } from '../../core/index.ts';
import { db } from '../db.ts';
import { localeOf } from '../format.ts';

export function WeekView({ profile }: { profile: Profile }) {
  const { t, i18n } = useTranslation();
  const locale = localeOf(i18n.resolvedLanguage);
  const availability = useLiveQuery(() => getAvailability(db, profile.id), [profile.id]);
  const now = new Date();
  const days = weekOf(now);
  const today = toIsoDate(now);
  const { week } = isoWeek(now);
  const dayFmt = new Intl.DateTimeFormat(locale, { weekday: 'long' });
  const dateFmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' });

  return (
    <section aria-labelledby="week-title">
      <div className="week-head">
        <h2 id="week-title">{t('week.title', { week })}</h2>
        <p className="muted">{t('week.range', { from: dateFmt.format(days[0]), to: dateFmt.format(days[6]) })}</p>
      </div>
      <ol className="week">
        {days.map((d) => {
          const iso = toIsoDate(d);
          const isToday = iso === today;
          const windows = availability?.windows.filter((w) => w.day === isoWeekday(d)) ?? [];
          return (
            <li key={iso} className={isToday ? 'day today' : 'day'} aria-current={isToday ? 'date' : undefined}>
              <div className="day-head">
                <span className="day-name">{dayFmt.format(d)}</span>
                <span className="muted">{dateFmt.format(d)}</span>
                {isToday && <span className="badge">{t('week.today')}</span>}
              </div>
              {windows.length > 0 && (
                <ul className="free" aria-label={t('week.freeTime')}>
                  {windows.map((w) => (
                    <li key={w.from}>{t('week.free', { from: w.from, to: w.to })}</li>
                  ))}
                </ul>
              )}
              <p className="muted empty">{t('week.empty')}</p>
            </li>
          );
        })}
      </ol>
      <p className="hint">{t('week.hint')}</p>
    </section>
  );
}
