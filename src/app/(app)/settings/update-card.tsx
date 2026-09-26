import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui';
import { InlineAction } from '@/components/ui/form';
import type { Household } from '@/db/schema';
import { formatDate } from '@/lib/format';
import { checkForUpdate, currentBuild, shortSha, updateProgress } from '@/lib/updates';
import { cancelUpdateAction, recheckUpdateAction, requestUpdateAction } from './actions';
import { UpdateWatcher } from './update-watcher';

/** Settings → Software update. Owner only; the page decides whether to render it. */
export async function UpdateCard({ hh }: { hh: Household }) {
  const t = await getTranslations('settings.update');
  const build = currentBuild();
  const progress = updateProgress();
  const check = await checkForUpdate();
  const date = (iso: string) => formatDate(iso, hh.locale, hh.timezone);

  return (
    <Card className="mt-4 flex flex-col gap-3">
      <h2 className="font-display font-semibold">{t('title')}</h2>
      <p className="text-sm">
        {build.commit === 'dev' ? (
          t('devBuild')
        ) : (
          <>
            {t('version')} <span className="font-mono text-xs">{shortSha(build.commit)}</span>
            {build.builtAt && <span className="text-fg-muted"> · {date(build.builtAt)}</span>}
          </>
        )}
      </p>

      {progress.state === 'done' && (
        <p className="text-sm text-fg-muted">
          {t('done', {
            from: shortSha(progress.request.fromCommit),
            date: date(progress.request.requestedAt),
          })}
        </p>
      )}

      {progress.state === 'queued' || progress.state === 'applying' ? (
        <div className="flex flex-col gap-3">
          <UpdateWatcher
            fromCommit={progress.request.fromCommit}
            requestedAt={progress.request.requestedAt}
            queued={progress.state === 'queued'}
          />
          {progress.state === 'queued' && (
            <InlineAction action={cancelUpdateAction} label={t('cancel')} variant="ghost" />
          )}
        </div>
      ) : check.state === 'unconfigured' ? (
        <>
          <p className="text-xs text-fg-muted">{t('unconfigured')}</p>
          <InlineAction
            action={requestUpdateAction}
            label={t('updateAnyway')}
            confirm={t('confirm')}
          />
        </>
      ) : check.state === 'error' ? (
        <>
          <p className="text-xs text-danger">{t('error', { message: check.message })}</p>
          <div className="flex flex-wrap gap-2">
            <InlineAction
              action={recheckUpdateAction}
              label={t('checkAgain')}
              variant="secondary"
            />
            <InlineAction
              action={requestUpdateAction}
              label={t('updateAnyway')}
              confirm={t('confirm')}
            />
          </div>
        </>
      ) : check.state === 'current' ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-fg-muted">{t('current')}</p>
          <InlineAction action={recheckUpdateAction} label={t('checkAgain')} variant="ghost" />
        </div>
      ) : (
        <>
          <p className="text-sm font-semibold">
            {check.total > 0
              ? t('available', { count: check.total })
              : t('availableUnknown', { sha: shortSha(check.latest) })}
          </p>
          {check.commits.length > 0 && (
            <ul className="flex flex-col gap-1 text-sm">
              {check.commits.map((c) => (
                <li key={c.sha} className="flex gap-2">
                  <span className="font-mono text-xs text-fg-muted">{shortSha(c.sha)}</span>
                  <span className="min-w-0 truncate">{c.message}</span>
                </li>
              ))}
              {check.total > check.commits.length && (
                <li className="text-xs text-fg-muted">
                  {t('more', { count: check.total - check.commits.length })}
                </li>
              )}
            </ul>
          )}
          <p className="text-xs text-fg-muted">{t('howItWorks')}</p>
          <InlineAction
            action={requestUpdateAction}
            label={t('updateNow')}
            confirm={t('confirm')}
          />
        </>
      )}
    </Card>
  );
}
