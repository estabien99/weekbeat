import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  ImportError,
  exportAll,
  exportFileName,
  importAll,
  parseExportFile,
  summarizeExport,
  type ExportFile,
  type ExportSummary,
} from '../../core/index.ts';
import { db } from '../db.ts';
import { localeOf } from '../format.ts';

function formatExportDate(iso: string, lang: string | undefined): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '?'
    : new Intl.DateTimeFormat(localeOf(lang), { dateStyle: 'medium', timeStyle: 'short' }).format(d);
}

function previewText(s: ExportSummary, t: TFunction): string {
  const parts = [
    t('data.preview.people', { count: s.people }),
    t('data.preview.planned', { count: s.planned }),
    t('data.preview.logged', { count: s.logged }),
    t('data.preview.places', { count: s.places }),
  ];
  return t('data.preview.intro', { list: parts.join(' · ') });
}

type Status = { kind: 'ok' | 'error'; text: string } | null;

/** Export all data to a JSON file and import it again (replaces everything, after confirmation). */
export function DataCard() {
  const { t, i18n } = useTranslation();
  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<ExportFile | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const confirmHeading = useRef<HTMLParagraphElement>(null);
  const isOpen = pending !== null;

  // Focus moves into the confirmation when it opens; when it closes it goes back to the import control.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (isOpen) confirmHeading.current?.focus();
    else if (wasOpen.current) fileInput.current?.focus();
    wasOpen.current = isOpen;
  }, [isOpen]);

  const doExport = async () => {
    const file = await exportAll(db);
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = exportFileName(new Date());
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus({ kind: 'ok', text: t('data.exported') });
  };

  const pick = async (f: File | undefined) => {
    if (!f) return;
    try {
      setPending(parseExportFile(await f.text()));
      setStatus(null);
    } catch (e) {
      const reason = e instanceof ImportError ? e.reason : 'not-json';
      setStatus({ kind: 'error', text: t(`data.errors.${reason}`) });
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const confirmImport = async () => {
    if (!pending) return;
    try {
      await importAll(db, pending);
      setStatus({ kind: 'ok', text: t('data.imported') });
    } catch (e) {
      const reason = e instanceof ImportError ? e.reason : 'not-weekbeat';
      setStatus({ kind: 'error', text: t(`data.errors.${reason}`) });
    }
    setPending(null);
  };

  return (
    <div className="card">
      <h3>{t('data.title')}</h3>
      <p className="muted">{t('data.explain')}</p>
      <div className="actions">
        <button type="button" onClick={() => void doExport()}>
          {t('data.export')}
        </button>
        <label className="button ghost">
          {t('data.import')}
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={(e) => void pick(e.target.files?.[0])}
          />
        </label>
      </div>
      {pending && (
        <div
          className="subcard"
          role="alertdialog"
          aria-labelledby="import-confirm"
          aria-describedby="import-confirm-text import-preview"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setPending(null);
          }}
        >
          <p id="import-confirm" ref={confirmHeading} tabIndex={-1}>
            <strong>
              {t('data.confirmTitle', { date: formatExportDate(pending.exportedAt, i18n.resolvedLanguage) })}
            </strong>
          </p>
          <p id="import-preview">{previewText(summarizeExport(pending), t)}</p>
          <p id="import-confirm-text">{t('data.confirmText')}</p>
          <div className="actions">
            <button type="button" className="ghost" onClick={() => void doExport()}>
              {t('data.backupFirst')}
            </button>
            <button type="button" className="danger" onClick={() => void confirmImport()}>
              {t('data.confirm')}
            </button>
            <button type="button" className="ghost" onClick={() => setPending(null)}>
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}
      {status && (
        <p className={status.kind === 'error' ? 'error' : 'ok'} role={status.kind === 'error' ? 'alert' : 'status'}>
          {status.text}
        </p>
      )}
    </div>
  );
}
