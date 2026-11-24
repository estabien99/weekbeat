import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { OPERATOR } from '../legal.ts';

/** Impressum: MStV § 18 Abs. 1 asks for name and address, "leicht erkennbar, unmittelbar erreichbar". */
export function Imprint() {
  const { t, i18n } = useTranslation();
  const heading = useRef<HTMLHeadingElement>(null);
  const lang = i18n.language.startsWith('en') ? 'en' : 'de';

  // Moves focus to the page heading so screen readers start here after the link in the footer.
  useEffect(() => heading.current?.focus(), []);

  return (
    <article className="card privacy">
      <h2 ref={heading} tabIndex={-1}>
        {t('imprint.title')}
      </h2>
      <section aria-labelledby="imprint-provider">
        <h3 id="imprint-provider">{t('imprint.provider')}</h3>
        <address>
          {OPERATOR.name}
          <br />
          {OPERATOR.street}
          <br />
          {OPERATOR.city}
          <br />
          {OPERATOR.country[lang]}
        </address>
      </section>
      <section aria-labelledby="imprint-contact">
        <h3 id="imprint-contact">{t('imprint.contact')}</h3>
        <p>
          {t('imprint.email')} <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>
        </p>
      </section>
      <section aria-labelledby="imprint-about">
        <h3 id="imprint-about">{t('imprint.about.title')}</h3>
        <p>{t('imprint.about.text')}</p>
      </section>
      <p className="muted small">{t('imprint.basis')}</p>
      <a className="button" href="#/">
        {t('privacy.back')}
      </a>
    </article>
  );
}
