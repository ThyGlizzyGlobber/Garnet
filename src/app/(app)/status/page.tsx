import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui';
import { Kv, PageTitle } from '@/components/ui/blocks';
import { Chip } from '@/components/ui/chip';
import { Disc } from '@/components/ui/colour';
import { viewerIsOperator } from '@/lib/auth/session';
import { pageContext } from '@/lib/context';
import { getEnv, isEmailConfigured, isLlmConfigured } from '@/lib/env';
import { listHouseholds } from '@/lib/households';
import { listMembers } from '@/lib/members';
import { statusView } from '@/lib/status';
import { currentBuild, shortSha } from '@/lib/updates';
import type { ReactNode } from 'react';

const DISC = '#5b6f82';

/**
 * Status, for the operator only (D11): the install as cards, each with its
 * facts and a chip saying whether it's working. Households never see this
 * page or its technical terms.
 */
export default async function StatusPage() {
  const { hh, me, dateTime, pct } = await pageContext();
  if (!(await viewerIsOperator())) redirect('/settings');
  const t = await getTranslations('status');
  const { household: h, install } = statusView(hh.id, me.id, true);
  if (!install) redirect('/settings');
  const env = getEnv();
  const build = currentBuild(env);
  const when = (iso: string | null | undefined) => (iso ? dateTime(iso) : '—');
  const ok = (label: string) => (
    <Chip tone="ok" icon="check">
      {label}
    </Chip>
  );
  const households = listHouseholds();
  const card = (icon: string, title: string, chip: ReactNode, rows: [string, ReactNode][]) => (
    <Card className="st-card">
      <div className="st-h">
        <Disc icon={icon} colour={DISC} size="sm" />
        <b>{title}</b>
        {chip}
      </div>
      <Kv rows={rows} />
    </Card>
  );
  const reader = install.extractors.find((ex) => ex.model);

  return (
    <div className="scr">
      <PageTitle title={t('title')} lede={t('lede')} />
      <div className="st-grid">
        {card(
          'download',
          t('software.title'),
          build.commit === 'dev' ? (
            <Chip tone="neutral">{t('software.dev')}</Chip>
          ) : (
            <Chip tone="ok" icon="check">
              {t('software.installed')}
            </Chip>
          ),
          [
            [
              t('software.installedLabel'),
              <>
                <span className="mono">{shortSha(build.commit)}</span>
                {build.builtAt && ` · ${t('software.built', { date: when(build.builtAt) })}`}
              </>,
            ],
            [t('software.updates'), t('software.updatesHint')],
          ],
        )}
        {card(
          'mail',
          t('billsAddresses.title'),
          !install.billsAddresses.configured ? (
            <Chip tone="neutral">{t('billsAddresses.off')}</Chip>
          ) : install.billsAddresses.householdBoundSince ? (
            ok(t('billsAddresses.bound'))
          ) : (
            <Chip tone="warn" icon="alert">
              {t('billsAddresses.olderWorker')}
            </Chip>
          ),
          [
            [
              t('billsAddresses.worker'),
              !install.billsAddresses.configured
                ? t('billsAddresses.offHint')
                : install.billsAddresses.householdBoundSince
                  ? t('billsAddresses.boundHint', {
                      date: when(install.billsAddresses.householdBoundSince),
                    })
                  : t('billsAddresses.olderWorkerHint'),
            ],
          ],
        )}
        {card(
          'file',
          t('documents.title'),
          h.waiting > 0 ? (
            <Chip tone="warn" icon="alert">
              {t('documents.toLookAt', { count: h.waiting })}
            </Chip>
          ) : (
            ok(t('documents.clear'))
          ),
          [
            [t('documents.analysed'), String(h.extracted)],
            [t('documents.waiting'), String(h.waiting)],
            [t('documents.other'), String(h.ignored)],
            [t('documents.autoRate'), h.autoRate === null ? '—' : pct(h.autoRate)],
            [
              t('documents.reader'),
              isLlmConfigured(env)
                ? t('documents.readerLine', {
                    model: reader?.model ?? env.ANTHROPIC_MODEL,
                    used: h.ai.used,
                    limit: h.ai.limit === null ? '∞' : String(h.ai.limit),
                  })
                : t('extractors.needsKey'),
            ],
            [t('extractors.thresholdLabel'), pct(h.threshold)],
          ],
        )}
        {card(
          'bell',
          t('emailOut.title'),
          isEmailConfigured(env) ? (
            ok(t('emailOut.working'))
          ) : (
            <Chip tone="neutral">{t('emailOut.off')}</Chip>
          ),
          [
            [t('emailOut.service'), env.EMAIL_LOG_ONLY ? t('emailOut.logOnly') : 'Resend'],
            [t('emailOut.from'), env.EMAIL_FROM ?? '—'],
          ],
        )}
        {card(
          'cloud-sun',
          t('weather.title'),
          install.weather.provider === 'off' ? (
            <Chip tone="neutral">{t('weather.off')}</Chip>
          ) : install.weather.lastError ? (
            <Chip tone="bad" icon="alert">
              {t('weather.error')}
            </Chip>
          ) : (
            ok(t('weather.working'))
          ),
          [
            [
              t('weather.source'),
              install.weather.provider === 'off'
                ? t('weather.off')
                : `${install.weather.provider}${install.weather.commercial ? ` · ${t('weather.commercial')}` : ''}`,
            ],
            [t('weather.lastRun'), when(install.weather.lastRun)],
            [t('weather.cells'), String(install.weather.cells)],
            [t('weather.calls'), String(install.weather.calls)],
            [t('weather.billsWithWeather'), String(h.billsWithWeather)],
            ...(install.weather.lastError
              ? [[t('weather.lastError'), install.weather.lastError] as [string, ReactNode]]
              : []),
          ],
        )}
        {card(
          'users',
          t('households.title'),
          install.regional.enabled ? (
            ok(t('regional.on'))
          ) : (
            <Chip tone="neutral">{t('regional.off')}</Chip>
          ),
          [
            ...households.map(
              (x) =>
                [
                  x.name,
                  t('households.line', {
                    demo: x.isDemo ? 'yes' : 'no',
                    people: listMembers(x.id).length,
                  }),
                ] as [string, ReactNode],
            ),
            [
              t('regional.title'),
              install.regional.figures > 0
                ? t('regional.figuresLine', {
                    sharing: install.regional.sharing,
                    figures: install.regional.figures,
                  })
                : t('regional.notEnough', {
                    sharing: install.regional.sharing,
                    k: install.regional.minHouseholds,
                  }),
            ],
          ],
        )}
        {card(
          'user',
          t('accounts.title'),
          <Chip tone="neutral">{t('accounts.count', { count: install.accounts.length })}</Chip>,
          [
            ...install.accounts.map(
              (a) =>
                [
                  a.name ? `${a.name} · ${a.email}` : a.email,
                  t('accounts.line', {
                    method: t(`accounts.${a.method}`),
                    households: a.households.length
                      ? a.households.map((x) => `${x.name} (${x.member})`).join(', ')
                      : t('accounts.noHousehold'),
                    last: a.lastSignInAt ? dateTime(a.lastSignInAt) : t('accounts.never'),
                  }),
                ] as [string, ReactNode],
            ),
            ['', t('accounts.hint')],
          ],
        )}
      </div>
    </div>
  );
}
