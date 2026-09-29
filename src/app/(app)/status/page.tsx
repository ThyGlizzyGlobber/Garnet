import { getTranslations } from 'next-intl/server';
import { Badge, Card, PageHeader } from '@/components/ui';
import { InlineAction } from '@/components/ui/form';
import { viewerIsOperator } from '@/lib/auth/session';
import { pageContext } from '@/lib/context';
import { statusView } from '@/lib/status';
import { pollNowAction } from '../review/actions';

export default async function StatusPage() {
  const { hh, dateTime, pct } = await pageContext();
  const t = await getTranslations('status');
  const { household: h, install } = statusView(hh.id, await viewerIsOperator());
  const when = (iso: string | null | undefined) => dateTime(iso) || '—';

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t('title')} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-sm text-fg-muted">{t('tiles.autoRate')}</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">
            {h.autoRate === null ? '—' : pct(h.autoRate)}
          </p>
          <p className="mt-1 text-xs text-fg-muted">{t('tiles.autoRateHint')}</p>
        </Card>
        <Card>
          <p className="text-sm text-fg-muted">{t('tiles.queue')}</p>
          <p
            className={`mt-1 text-3xl font-semibold tabular-nums ${h.waiting > 0 ? 'text-warning' : ''}`}
          >
            {h.waiting}
          </p>
          <p className="mt-1 text-xs text-fg-muted">
            {t('tiles.queueHint', { extracted: h.extracted, ignored: h.ignored })}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-fg-muted">{t('tiles.archived')}</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{h.archived}</p>
          <p className="mt-1 text-xs text-fg-muted">{t('tiles.archivedHint')}</p>
        </Card>
      </div>

      <Card className="mt-4">
        <h2 className="font-semibold">{t('reading.title')}</h2>
        {install && (
          <ul className="mt-2 divide-y divide-border text-sm">
            {install.extractors.map((ex) => (
              <li key={ex.name} className="flex items-center justify-between py-2">
                <span>
                  <span className="font-medium">{ex.name}</span>
                  {ex.model && <span className="ml-2 text-xs text-fg-muted">{ex.model}</span>}
                </span>
                <Badge tone={ex.ready ? 'success' : 'neutral'}>
                  {ex.ready ? t('extractors.ready') : t('extractors.needsKey')}
                </Badge>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-fg-muted">
          {t('extractors.threshold', { pct: Math.round(h.threshold * 100) })}{' '}
          {h.ai.limit === null
            ? t('extractors.aiUsageUncapped', { used: h.ai.used })
            : t('extractors.aiUsage', { used: h.ai.used, limit: h.ai.limit })}
        </p>
        <p className="mt-1 text-xs text-fg-muted">
          {t('weather.billsWithWeather')}: {h.billsWithWeather}
        </p>
      </Card>

      {install && (
        <>
          <Card className="mt-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">{t('mailbox.title')}</h2>
                <p className="text-xs text-fg-muted">
                  {install.mailbox.account ?? t('mailbox.notConfigured')}
                </p>
              </div>
              <Badge
                tone={
                  ({ off: 'neutral', error: 'danger', on: 'success', paused: 'warning' } as const)[
                    install.mailbox.state
                  ]
                }
              >
                {t(`mailbox.${install.mailbox.state}`)}
              </Badge>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-fg-muted">{t('mailbox.interval')}</dt>
              <dd>
                {install.mailbox.intervalSeconds > 0
                  ? t('mailbox.everySeconds', { seconds: install.mailbox.intervalSeconds })
                  : t('mailbox.disabled')}
              </dd>
              <dt className="text-fg-muted">{t('mailbox.lastPoll')}</dt>
              <dd>{when(install.mailbox.lastPollAt)}</dd>
              <dt className="text-fg-muted">{t('mailbox.nextPoll')}</dt>
              <dd>{when(install.mailbox.nextPollAt)}</dd>
              <dt className="text-fg-muted">{t('mailbox.lastResult')}</dt>
              <dd>
                {install.mailbox.lastPoll
                  ? (install.mailbox.lastPoll.error ??
                    t('mailbox.result', {
                      messages: install.mailbox.lastPoll.messagesSeen,
                      docs: install.mailbox.lastPoll.documentsArchived,
                    }))
                  : '—'}
              </dd>
              <dt className="text-fg-muted">{t('mailbox.polls')}</dt>
              <dd>
                {t('mailbox.pollsValue', {
                  polls: install.mailbox.pollCount,
                  errors: install.mailbox.errorCount,
                })}
              </dd>
              <dt className="text-fg-muted">{t('mailbox.lastUid')}</dt>
              <dd>{install.mailbox.lastUid}</dd>
            </dl>
            {install.mailbox.configured && (
              <div className="mt-4">
                <InlineAction action={pollNowAction} label={t('mailbox.pollNow')} />
              </div>
            )}
          </Card>

          <Card className="mt-4">
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-semibold">{t('weather.title')}</h2>
              <Badge
                tone={
                  install.weather.provider === 'off'
                    ? 'neutral'
                    : install.weather.lastError
                      ? 'danger'
                      : 'success'
                }
              >
                {install.weather.provider === 'off'
                  ? t('weather.off')
                  : `${install.weather.provider}${install.weather.commercial ? ` · ${t('weather.commercial')}` : ''}`}
              </Badge>
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
              <dt className="text-fg-muted">{t('weather.lastRun')}</dt>
              <dd>{when(install.weather.lastRun)}</dd>
              <dt className="text-fg-muted">{t('weather.cells')}</dt>
              <dd>{install.weather.cells}</dd>
              <dt className="text-fg-muted">{t('weather.calls')}</dt>
              <dd>{install.weather.calls}</dd>
            </dl>
            {install.weather.lastError && (
              <p className="mt-2 text-xs text-danger">{install.weather.lastError}</p>
            )}
            <p className="mt-2 text-xs text-fg-muted">{t('weather.hint')}</p>
          </Card>

          <Card className="mt-4">
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-semibold">{t('regional.title')}</h2>
              <Badge tone={install.regional.enabled ? 'success' : 'neutral'}>
                {install.regional.enabled ? t('regional.on') : t('regional.off')}
              </Badge>
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
              <dt className="text-fg-muted">{t('regional.sharing')}</dt>
              <dd>{install.regional.sharing}</dd>
              <dt className="text-fg-muted">{t('regional.figures')}</dt>
              <dd>{install.regional.figures}</dd>
            </dl>
            <p className="mt-2 text-xs text-fg-muted">
              {t('regional.hint', { k: install.regional.minHouseholds })}
            </p>
          </Card>
        </>
      )}
    </div>
  );
}
