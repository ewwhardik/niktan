import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { Button } from '../ui/Button';
import { Screen, TopBar } from '../ui/Layout';

interface Status {
  version: string;
  db: boolean;
  providers: Record<'gemini' | 'groq' | 'workersAi', boolean>;
  last24h: { provider: string; kind: string; ok: number; total: number }[];
}

export default function ServiceStatus() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status | null>(null);
  const [fetching, setFetching] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    api.get<Status>('/api/status')
      .then((s) => { if (active) setStatus(s); })
      .catch(() => { if (active) setFailed(true); })
      .finally(() => { if (active) setFetching(false); });
    return () => { active = false; };
  }, [attempt]);
  return (
    <Screen className="pb-8">
      <TopBar onBack={() => navigate('/')} />
      <h1 className="mt-5 text-title-1 font-semibold">{t('service.title')}</h1>
      <div aria-live="polite" className="my-5">
        {failed && status && <p role="status" className="mb-3 rounded-md bg-seetoday-tint p-3">{t('design.stale')}</p>}
        {status ? <>
          <p className="mb-4 text-body-lg">{t(status.db ? 'service.ready' : 'service.dbDown')}</p>
          <dl className="divide-y divide-border rounded-lg bg-surface px-4 shadow-1">
            {(['gemini', 'groq', 'workersAi'] as const).map((id) => (
              <div className="flex justify-between gap-3 py-3" key={id}>
                <dt>{{ gemini: 'Gemini', groq: 'Groq', workersAi: 'Workers AI' }[id]}</dt>
                <dd>{t(status.providers[id] ? 'service.configured' : 'service.off')}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-5 text-body">{t('service.fallback')}</p>
          <p className="mt-4 text-caption text-text-3">{t('service.usage', {
            ok: status.last24h.reduce((n, entry) => n + entry.ok, 0),
            total: status.last24h.reduce((n, entry) => n + entry.total, 0),
          })} · v{status.version}</p>
        </> : <p>{t(failed ? 'service.down' : 'common.loading')}</p>}
      </div>
      <Button variant="secondary" loading={fetching} onClick={() => { setFetching(true); setFailed(false); setAttempt((n) => n + 1); }}>
        {t('service.refresh')}
      </Button>
    </Screen>
  );
}
