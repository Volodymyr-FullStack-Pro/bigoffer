'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { useState } from 'react';
import { createTelegramLink, disconnectTelegram, saveTelegramSettings } from './telegram-actions';

export type TelegramSettings = { connected: boolean; alerts: boolean; minScore: number; digestHour: number; timezone: string };

export function TelegramSection({ botConfigured, settings }: { botConfigured: boolean; settings: TelegramSettings }) {
  const t = useTranslations('telegram');
  return (
    <section data-testid="telegram-section" className="brutal flex max-w-2xl flex-col gap-3 p-5">
      <h2 className="font-display text-lg font-bold">{t('title')}</h2>
      {!botConfigured ? (
        <p data-testid="telegram-unavailable" className="text-sm text-muted-foreground">{t('notConfigured')}</p>
      ) : settings.connected ? (
        <Connected settings={settings} />
      ) : (
        <Connect />
      )}
    </section>
  );
}

function Connect() {
  const t = useTranslations('telegram');
  const router = useRouter();
  const [url, setUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'pending' | 'error'>('idle');
  const connect = async () => {
    setStatus('pending');
    const res = await createTelegramLink();
    if (res.ok) {
      setUrl(res.url);
      setStatus('idle');
    } else setStatus('error');
  };
  return (
    <>
      <p className="text-sm text-muted-foreground">{t('intro')}</p>
      {url ? (
        <div className="flex flex-col gap-3">
          <a data-testid="telegram-link" href={url} target="_blank" rel="noopener noreferrer" className="brutal brutal-press self-start bg-brand px-4 py-2 font-semibold text-brand-foreground">
            {t('openBot')}
          </a>
          <p className="text-sm">{t('linkHint')}</p>
          <button type="button" data-testid="telegram-check" onClick={() => router.refresh()} className="brutal brutal-press self-start bg-card px-4 py-2 font-semibold">
            {t('check')}
          </button>
        </div>
      ) : (
        <button type="button" data-testid="telegram-connect" disabled={status === 'pending'} onClick={() => void connect()} className="brutal brutal-press self-start bg-brand px-4 py-2 font-semibold text-brand-foreground disabled:opacity-60">
          {t('connect')}
        </button>
      )}
      <p role="status" className="text-sm text-danger">{status === 'error' && t('error')}</p>
    </>
  );
}

function Connected({ settings }: { settings: TelegramSettings }) {
  const t = useTranslations('telegram');
  const router = useRouter();
  const [alerts, setAlerts] = useState(settings.alerts);
  const [minScore, setMinScore] = useState(String(settings.minScore));
  const [digestHour, setDigestHour] = useState(settings.digestHour);
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const score = Number(minScore);
  const scoreValid = minScore.trim() !== '' && Number.isInteger(score) && score >= 0 && score <= 100;

  const save = async () => {
    if (!scoreValid) return setStatus('error');
    setStatus((await saveTelegramSettings(alerts, score, digestHour)) ? 'saved' : 'error');
  };
  const disconnect = async () => {
    if (await disconnectTelegram()) router.refresh();
    else setStatus('error');
  };

  return (
    <div className="flex flex-col gap-4">
      <p data-testid="telegram-connected" className="font-semibold">✓ {t('connected')}</p>
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input data-testid="telegram-alerts" type="checkbox" checked={alerts} onChange={(e) => setAlerts(e.target.checked)} className="size-5" />
        {t('alerts')}
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold">
        {t('minScore')}
        <select data-testid="telegram-min-score" value={minScore} onChange={(e) => setMinScore(e.target.value)} className="w-28 rounded-xl border border-border bg-card px-3 py-2 font-normal">
          {[...new Set([50, 60, 70, 75, 80, 85, 90, 95, score])].filter((n) => Number.isInteger(n)).sort((a, b) => a - b).map((n) => (
            <option key={n} value={n}>≥ {n}%</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold">
        {t('digestHour')}
        <select data-testid="digest-hour" value={digestHour} onChange={(e) => setDigestHour(Number(e.target.value))} className="w-28 rounded-xl border border-border bg-card px-3 py-2 font-normal">
          {Array.from({ length: 24 }, (_, h) => (
            <option key={h} value={h}>{`${String(h).padStart(2, '0')}:00`}</option>
          ))}
        </select>
        <span className="text-xs font-normal text-muted-foreground">{t('timezone', { timezone: settings.timezone })}</span>
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" data-testid="telegram-save" onClick={() => void save()} className="brutal brutal-press bg-brand px-4 py-2 font-semibold text-brand-foreground">{t('save')}</button>
        <button type="button" data-testid="telegram-disconnect" onClick={() => void disconnect()} className="brutal brutal-press bg-card px-4 py-2 font-semibold">{t('disconnect')}</button>
        <p role="status" className="text-sm">{status === 'saved' && t('saved')}{status === 'error' && t('error')}</p>
      </div>
    </div>
  );
}
