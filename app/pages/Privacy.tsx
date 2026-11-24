import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

/** Primary source for what the host logs (docs "What is GitHub Pages?", section "Data collection"). */
const GITHUB_PAGES_DATA =
  'https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages#data-collection';
const GITHUB_PRIVACY = 'https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement';

const SECTIONS = ['device', 'none', 'host', 'control', 'connectors'] as const;

export function Privacy() {
  const { t } = useTranslation();
  const heading = useRef<HTMLHeadingElement>(null);

  // Moves focus to the page heading so screen readers start here after the link in the footer.
  useEffect(() => heading.current?.focus(), []);

  return (
    <article className="card privacy">
      <h2 ref={heading} tabIndex={-1}>
        {t('privacy.title')}
      </h2>
      <p>{t('privacy.intro')}</p>
      {SECTIONS.map((s) => (
        <section key={s} aria-labelledby={`privacy-${s}`}>
          <h3 id={`privacy-${s}`}>{t(`privacy.${s}.title`)}</h3>
          <p>{t(`privacy.${s}.text`)}</p>
          {s === 'host' && (
            <ul className="links">
              <li>
                <a href={GITHUB_PAGES_DATA} target="_blank" rel="noopener noreferrer">
                  {t('privacy.host.docs')}
                </a>
              </li>
              <li>
                <a href={GITHUB_PRIVACY} target="_blank" rel="noopener noreferrer">
                  {t('privacy.host.statement')}
                </a>
              </li>
            </ul>
          )}
        </section>
      ))}
      <p className="muted small">{t('privacy.updated')}</p>
      <a className="button" href="#/">
        {t('privacy.back')}
      </a>
    </article>
  );
}
