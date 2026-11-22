import { useTranslation } from 'react-i18next';
import {
  valueMeter,
  type Lang,
  type LoggedActivity,
  type Membership,
  type Place,
  type Profile,
} from '../../core/index.ts';
import { localeOf } from '../format.ts';
import { formatEur } from '../memberships.ts';

/**
 * The value meter (issue #8): this month's visits through the person's memberships, what they would have cost
 * at single-visit prices, and the person's own share. Plain information, no target and no loss wording; shown
 * only to people with a membership.
 */
export function ValueMeterCard({
  profile,
  month,
  logs,
  places,
  memberships,
}: {
  profile: Profile;
  /** YYYY-MM */
  month: string;
  logs: readonly LoggedActivity[];
  places: readonly Place[];
  memberships: readonly Membership[];
}) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage ?? 'de') as Lang;
  if (!memberships.some((m) => m.ownerProfileId === profile.id)) return null;
  const meter = valueMeter(profile.id, month, logs, places, memberships);
  const monthName = new Intl.DateTimeFormat(localeOf(lang), { month: 'long' }).format(new Date(`${month}-15T12:00`));

  return (
    <div className="card value-meter">
      <h3>{t('value.title', { month: monthName, name: profile.name })}</h3>
      {meter.visits === 0 ? (
        <p className="muted">{t('value.none')}</p>
      ) : (
        <dl className="figures">
          <div>
            <dt>{t('value.visits')}</dt>
            <dd>{meter.visits}</dd>
          </div>
          {meter.priced > 0 && (
            <div>
              <dt>{t('value.worth', { count: meter.priced })}</dt>
              <dd>{formatEur(meter.valueEur, lang)}</dd>
            </div>
          )}
          {meter.shareEur !== undefined && (
            <div>
              <dt>{t('value.share')}</dt>
              <dd>{formatEur(meter.shareEur, lang)}</dd>
            </div>
          )}
        </dl>
      )}
      <p className="muted small">{t('value.hint')}</p>
    </div>
  );
}
