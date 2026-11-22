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

  if (!needRefresh && !offlineReady) return null;
  return (
    <div className="toast" role="status">
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
