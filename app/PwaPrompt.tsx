import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useRegisterSW } from 'virtual:pwa-register/react';

/** Asks before activating a new version (no silent reloads while someone is logging a session). */
export function PwaPrompt() {
  const { t } = useTranslation();
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW();

  // "Works offline" is information only: hide it after a moment. Updates wait for the user.
  useEffect(() => {
    if (!offlineReady) return;
    const id = setTimeout(() => setOfflineReady(false), 6000);
    return () => clearTimeout(id);
  }, [offlineReady, setOfflineReady]);

  // WCAG 2.2 2.4.11: reserve the notice's height at the bottom so it never covers the focused control.
  const ref = useRef<HTMLDivElement>(null);
  const open = needRefresh || offlineReady;
  useEffect(() => {
    const el = ref.current;
    if (!open || !el) return;
    const root = document.documentElement;
    const gap = 16; // the notice sits 16 px above the bottom edge
    const update = () => root.style.setProperty('--toast-space', `${el.offsetHeight + 2 * gap}px`);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty('--toast-space');
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="toast" role="status" ref={ref}>
      <span>{needRefresh ? t('pwa.update') : t('pwa.offline')}</span>
      {needRefresh && (
        <button type="button" onClick={() => void updateServiceWorker(true)}>
          {t('pwa.reload')}
        </button>
      )}
      <button
        type="button"
        className="ghost"
        onClick={() => {
          setNeedRefresh(false);
          setOfflineReady(false);
        }}
      >
        {t('pwa.close')}
      </button>
    </div>
  );
}
