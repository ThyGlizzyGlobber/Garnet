import { getTranslations } from 'next-intl/server';
import { Badge, Card, PageHeader } from '@/components/ui';
import { InlineAction } from '@/components/ui/form';
import { allExtractors } from '@/ingest/extractors';
import { readImapState } from '@/ingest/imap/poller';
import { viewerIsOperator } from '@/lib/auth/session';
import { aiAllowance } from '@/lib/usage';
import { pageContext } from '@/lib/context';
import { getEnv, isImapConfigured, isLlmConfigured } from '@/lib/env';
import { documentCounts, ingestionStats } from '@/lib/review';
import { workerStatus } from '@/worker';
import { pollNowAction } from '../review/actions';

export default async function StatusPage() {
  const { hh, date } = await pageContext();
  const operator = await viewerIsOperator();
  const ai = aiAllowance(hh.id);
  const t = await getTranslations('status');
  const env = getEnv();
  const w = workerStatus();
  const counts = documentCounts(hh.id);
  const ing = ingestionStats(hh.id);
  const imap = readImapState();
  const total = counts.extracted + counts.needs_review + counts.ignored + counts.unprocessed;
  const decided = ing.auto + ing.reviewed + counts.needs_review;
  const autoRate = decided > 0 ? Math.round((ing.auto / decided) * 100) : null;
  const dt = (iso: string | null | undefined) =>
    iso ? `${date(iso, 'short')} ${new Date(iso).toLocaleTimeString()}` : '—';

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t('title')} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-sm text-fg-muted">{t('tiles.autoRate')}</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">
            {autoRate === null ? '—' : `${autoRate}%`}
          </p>
          <p className="mt-1 text-xs text-fg-muted">{t('tiles.autoRateHint')}</p>
        </Card>
        <Card>
          <p className="text-sm text-fg-muted">{t('tiles.queue')}</p>
          <p
            className={`mt-1 text-3xl font-semibold tabular-nums ${counts.needs_review > 0 ? 'text-warning' : ''}`}
          >
            {counts.needs_review}
          </p>
          <p className="mt-1 text-xs text-fg-muted">
            {t('tiles.queueHint', { extracted: counts.extracted, ignored: counts.ignored })}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-fg-muted">{t('tiles.archived')}</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{total}</p>
          <p className="mt-1 text-xs text-fg-muted">{t('tiles.archivedHint')}</p>
        </Card>
      </div>

      <Card className="mt-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">{t('mailbox.title')}</h2>
            <p className="text-xs text-fg-muted">
              {isImapConfigured(env)
                ? `${env.IMAP_USER} @ ${env.IMAP_HOST}:${env.IMAP_PORT} · ${env.IMAP_MAILBOX}`
                : t('mailbox.notConfigured')}
            </p>
          </div>
          <Badge
            tone={
              !isImapConfigured(env)
                ? 'neutral'
                : w.lastPoll?.error
                  ? 'danger'
                  : w.enabled
                    ? 'success'
                    : 'warning'
            }
          >
            {!isImapConfigured(env)
              ? t('mailbox.off')
              : w.lastPoll?.error
                ? t('mailbox.error')
                : w.enabled
                  ? t('mailbox.on')
                  : t('mailbox.paused')}
          </Badge>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-fg-muted">{t('mailbox.interval')}</dt>
          <dd>
            {w.intervalSeconds > 0
              ? t('mailbox.everySeconds', { seconds: w.intervalSeconds })
              : t('mailbox.disabled')}
          </dd>
          <dt className="text-fg-muted">{t('mailbox.lastPoll')}</dt>
          <dd>{dt(w.lastPoll?.finishedAt)}</dd>
          <dt className="text-fg-muted">{t('mailbox.nextPoll')}</dt>
          <dd>{dt(w.nextPollAt)}</dd>
          <dt className="text-fg-muted">{t('mailbox.lastResult')}</dt>
          <dd>
            {w.lastPoll
              ? (w.lastPoll.error ??
                t('mailbox.result', {
                  messages: w.lastPoll.messagesSeen,
                  docs: w.lastPoll.documentsArchived,
                }))
              : '—'}
          </dd>
          <dt className="text-fg-muted">{t('mailbox.polls')}</dt>
          <dd>{t('mailbox.pollsValue', { polls: w.pollCount, errors: w.errorCount })}</dd>
          <dt className="text-fg-muted">{t('mailbox.lastUid')}</dt>
          <dd>{imap.lastUid}</dd>
        </dl>
        {isImapConfigured(env) && operator && (
          <div className="mt-4">
            <InlineAction action={pollNowAction} label={t('mailbox.pollNow')} />
          </div>
        )}
      </Card>

      <Card className="mt-4">
        <h2 className="font-semibold">{t('extractors.title')}</h2>
        <ul className="mt-2 divide-y divide-border text-sm">
          {allExtractors.map((ex) => {
            const llm = ex.name.startsWith('llm');
            const ready = llm ? isLlmConfigured(env) : true;
            return (
              <li key={ex.name} className="flex items-center justify-between py-2">
                <span>
                  <span className="font-medium">{ex.name}</span>
                  {llm && <span className="ml-2 text-xs text-fg-muted">{env.ANTHROPIC_MODEL}</span>}
                </span>
                <Badge tone={ready ? 'success' : 'neutral'}>
                  {ready ? t('extractors.ready') : t('extractors.needsKey')}
                </Badge>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs text-fg-muted">
          {t('extractors.threshold', { pct: Math.round(env.EXTRACTOR_CONFIDENCE_THRESHOLD * 100) })}{' '}
          {t('extractors.aiUsage', ai)}
        </p>
      </Card>
    </div>
  );
}
