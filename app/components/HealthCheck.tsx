import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { saveHealthCheck, screeningQuestions, toIsoDate, type Lang, type Profile } from '../../core/index.ts';
import { knowledgeRules } from '../../knowledge/index.ts';
import { db } from '../db.ts';

/** The official PAR-Q+ (only linked: its terms do not allow embedding it in an app without permission). */
const PARQ_URL = 'https://eparmedx.com/';

const QUESTIONS = screeningQuestions(knowledgeRules);

/**
 * Health self-check before the start (issue #4): yes/no questions from knowledge/, our own wording. Only the
 * outcome is saved. Any yes pauses the plan and suggests talking to a doctor; no diagnosis.
 */
export function HealthCheck({
  profile,
  onDone,
  onCancel,
}: {
  profile: Profile;
  onDone: () => void;
  /** Shown as a cancel button next to submit (not on the result). */
  onCancel?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage ?? 'de') as Lang;
  const id = useId();
  const [answers, setAnswers] = useState<Record<string, boolean>>({});
  const [error, setError] = useState(false);
  const [flagged, setFlagged] = useState(false);
  const result = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (flagged) result.current?.focus();
  }, [flagged]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (QUESTIONS.some((q) => answers[q.id] === undefined)) {
      setError(true);
      return;
    }
    const yes = QUESTIONS.some((q) => answers[q.id]);
    await saveHealthCheck(db, profile.id, toIsoDate(new Date()), yes);
    if (yes) setFlagged(true);
    else onDone();
  };

  if (flagged)
    return (
      <div className="health-result" role="group" aria-labelledby={`${id}-result`}>
        <h3 id={`${id}-result`} ref={result} tabIndex={-1}>
          {t('health.flaggedTitle')}
        </h3>
        <p>{t('health.flagged', { name: profile.name })}</p>
        <p className="muted small">{t('health.flaggedNext')}</p>
        <button type="button" onClick={onDone}>
          {t('common.next')}
        </button>
      </div>
    );

  return (
    <form className="interview" onSubmit={(e) => void submit(e)} noValidate>
      <p>{t('health.intro', { name: profile.name })}</p>
      {QUESTIONS.map((q, i) => (
        <fieldset key={q.id} className="choices yes-no">
          <legend>
            {i + 1}. {q.question[lang]}
          </legend>
          {([true, false] as const).map((v) => (
            <label key={String(v)} className="choice">
              <input
                type="radio"
                name={`${id}-${q.id}`}
                checked={answers[q.id] === v}
                onChange={() => {
                  setAnswers({ ...answers, [q.id]: v });
                  setError(false);
                }}
              />
              <span>{t(v ? 'common.yes' : 'common.no')}</span>
            </label>
          ))}
        </fieldset>
      ))}
      {error && (
        <p className="error" role="alert">
          {t('health.answerAll')}
        </p>
      )}
      <p className="muted small">
        {t('health.privacy')}{' '}
        <a href={PARQ_URL} target="_blank" rel="noreferrer">
          {t('health.parq')}
          <span className="sr-only"> {t('common.newTab')}</span>
        </a>
      </p>
      <p className="muted small">{t('health.disclaimer')}</p>
      <div className="actions">
        <button type="submit">{t('health.submit')}</button>
        {onCancel && (
          <button type="button" className="ghost" onClick={onCancel}>
            {t('common.cancel')}
          </button>
        )}
      </div>
    </form>
  );
}
