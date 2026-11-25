import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getHousehold } from '../core/index.ts';
import { db } from './db.ts';
import { PwaPrompt } from './PwaPrompt.tsx';
import { Places } from './pages/Places.tsx';
import { Imprint } from './pages/Imprint.tsx';
import { Privacy } from './pages/Privacy.tsx';
import { Settings } from './pages/Settings.tsx';
import { Setup } from './pages/Setup.tsx';
import { WeekView } from './pages/WeekView.tsx';
import { useActiveProfile } from './useActiveProfile.ts';

type Page = 'week' | 'places' | 'settings' | 'privacy' | 'imprint';

function pageFromHash(): Page {
  if (location.hash === '#/einstellungen') return 'settings';
  if (location.hash === '#/orte') return 'places';
  if (location.hash === '#/datenschutz') return 'privacy';
  if (location.hash === '#/impressum') return 'imprint';
  return 'week';
}

export function App() {
  const { t } = useTranslation();
  // null = checked, no household yet; undefined = still loading.
  const household = useLiveQuery(async () => (await getHousehold(db)) ?? null, []);
  const { profiles, active, select } = useActiveProfile();
  const [page, setPage] = useState<Page>(pageFromHash);
  // Keeps the setup on screen for step 2, after the household already exists.
  const [setupActive, setSetupActive] = useState(false);

  useEffect(() => {
    const onHash = () => setPage(pageFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const ready = household !== undefined && profiles !== undefined;
  const inSetup = ready && (household === null || setupActive);

  // WCAG 2.2 2.4.2 Page Titled: each view names itself in the browser tab and for screen readers.
  useEffect(() => {
    const name: Record<Page, string> = {
      week: t('nav.week'),
      places: t('nav.places'),
      settings: t('nav.settings'),
      privacy: t('privacy.title'),
      imprint: t('imprint.title'),
    };
    document.title =
      inSetup && page !== 'privacy' && page !== 'imprint' ? t('setup.title') : t('app.pageTitle', { page: name[page] });
  }, [t, page, inSetup]);

  return (
    <>
      <header className="top">
        <div>
          <h1>{t('app.name')}</h1>
          <p className="muted">{t('app.tagline')}</p>
        </div>
        {household && profiles && profiles.length > 1 && active && (
          <label className="switcher">
            <span className="sr-only">{t('nav.person')}</span>
            <select value={active.id} onChange={(e) => select(e.target.value)} aria-label={t('nav.person')}>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </header>

      {household && !setupActive && (
        <nav className="tabs" aria-label={t('nav.label')}>
          <a href="#/" aria-current={page === 'week' ? 'page' : undefined}>
            {t('nav.week')}
          </a>
          <a href="#/orte" aria-current={page === 'places' ? 'page' : undefined}>
            {t('nav.places')}
          </a>
          <a href="#/einstellungen" aria-current={page === 'settings' ? 'page' : undefined}>
            {t('nav.settings')}
          </a>
        </nav>
      )}

      <main>
        {page === 'privacy' ? (
          // Readable before setup too: people should see it before they enter anything.
          <Privacy />
        ) : page === 'imprint' ? (
          <Imprint />
        ) : !ready ? null : household === null || setupActive ? (
          <Setup
            onStart={() => setSetupActive(true)}
            onDone={(id) => {
              select(id);
              setSetupActive(false);
            }}
          />
        ) : page === 'settings' ? (
          <Settings profiles={profiles} />
        ) : page === 'places' && active ? (
          <Places profiles={profiles} activeId={active.id} />
        ) : active ? (
          <WeekView profile={active} />
        ) : null}
      </main>

      <footer className="muted">
        <p>{t('footer.disclaimer')}</p>
        <a className="footer-link" href="#/datenschutz" aria-current={page === 'privacy' ? 'page' : undefined}>
          {t('privacy.link')}
        </a>
        <a className="footer-link" href="#/impressum" aria-current={page === 'imprint' ? 'page' : undefined}>
          {t('imprint.link')}
        </a>
      </footer>
      <PwaPrompt />
    </>
  );
}
