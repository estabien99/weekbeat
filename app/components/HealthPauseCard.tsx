import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ValidationError,
  clearHealthHold,
  endPause,
  healthHold,
  setPause,
  toIsoDate,
  type Profile,
} from '../../core/index.ts';
import { db } from '../db.ts';
import { useDateText } from '../useDateText.ts';
import { HealthCheck } from './HealthCheck.tsx';

/** Settings → health and pause (issue #4): self-check status, doctor's OK, pause mode with an editable end. */
export function HealthPauseCard({ profiles }: { profiles: Profile[] }) {
  const { t } = useTranslation();
  return (
    <div className="card">
      <h3>{t('health.title')}</h3>
      <ul className="health-people">
        {profiles.map((p) => (
          <PersonHealth key={p.id} profile={p} />
        ))}
      </ul>
      <p className="muted small">{t('health.disclaimer')}</p>
    </div>
  );
}

function PersonHealth({ profile: p }: { profile: Profile }) {
  const { t } = useTranslation();
  const id = useId();
  const date = useDateText();
  const today = toIsoDate(new Date());
  const paused = !!p.pausedUntil && p.pausedUntil >= today;
  const [until, setUntil] = useState(paused ? p.pausedUntil! : '');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const held = healthHold(p);

  const run = async (f: () => Promise<void>, done: string) => {
    try {
      await f();
      setError('');
      setMessage(done);
    } catch (err) {
      setMessage('');
      setError(err instanceof ValidationError ? t(`errors.${err.field}`, { defaultValue: err.message }) : String(err));
    }
  };

  return (
    <li className="health-person">
      <h4>{p.name}</h4>
      {!checking && (
        <>
          <p>
            {!p.health
              ? t('health.none')
              : held
                ? t('health.held', { date: date(p.health.checkedOn) })
                : p.health.clearedOn
                  ? t('health.cleared', { date: date(p.health.clearedOn) })
                  : t('health.clear', { date: date(p.health.checkedOn) })}
          </p>
          {held && <p className="muted small">{t('health.flaggedNext')}</p>}
          <div className="actions">
            {held && (
              <button
                type="button"
                onClick={() => void run(() => clearHealthHold(db, p.id, today), t('health.clearedNow'))}
              >
                {t('health.doctorOk')}
              </button>
            )}
            <button type="button" className="ghost" onClick={() => setChecking(true)}>
              {t(p.health ? 'health.again' : 'health.start', { name: p.name })}
            </button>
          </div>
        </>
      )}
      {checking && (
        <div className="subcard">
          <HealthCheck
            profile={p}
            onDone={() => {
              setChecking(false);
              setMessage(t('common.saved'));
            }}
            onCancel={() => setChecking(false)}
          />
        </div>
      )}

      <p>{paused ? t('health.pausedUntil', { date: date(p.pausedUntil!) }) : t('health.notPaused')}</p>
      <div className="field">
        <label htmlFor={`${id}-until`}>{t('health.pauseUntil')}</label>
        <input
          id={`${id}-until`}
          type="date"
          min={today}
          value={until}
          aria-describedby={`${id}-pause-hint`}
          onChange={(e) => setUntil(e.target.value)}
        />
        <p id={`${id}-pause-hint`} className="muted small">
          {t('health.pauseHint')}
        </p>
      </div>
      <div className="actions">
        <button
          type="button"
          onClick={() =>
            void run(() => setPause(db, p.id, today, until), t(paused ? 'health.pauseChanged' : 'health.pauseStarted'))
          }
        >
          {t(paused ? 'health.pauseChange' : 'health.pauseStart')}
        </button>
        {paused && (
          <button
            type="button"
            className="ghost"
            onClick={() =>
              void run(async () => {
                await endPause(db, p.id, today);
                setUntil('');
              }, t('health.pauseEnded'))
            }
          >
            {t('health.pauseEnd')}
          </button>
        )}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <p role="status" className="ok">
        {message}
      </p>
    </li>
  );
}
