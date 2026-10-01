import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui';
import { overview } from '@/lib/console';
import { getEnv } from '@/lib/env';
import { currentBuild, shortSha } from '@/lib/updates';

/** The install at a glance (SCOPE-console.md §3a): big numbers, a line each. */
export default async function ConsoleOverviewPage() {
  const t = await getTranslations('console.overview');
  const o = overview();
  const build = currentBuild(getEnv());
  const stat = (href: string, big: string, sub: string) => (
    <Link href={href} className="glass rounded-card p-5 con-stat">
      <b>{big}</b>
      <span className="muted small">{sub}</span>
    </Link>
  );
  return (
    <div className="con-stats">
      {stat(
        '/console/households',
        t('households', { count: o.households }),
        t('householdsSub', { demo: o.demoHouseholds }),
      )}
      {stat(
        '/console/accounts',
        t('accounts', { count: o.accounts }),
        t('accountsSub', { week: o.accountsThisWeek }),
      )}
      {stat('/console/access', t('requests', { count: o.openRequests }), t('requestsSub'))}
      {stat(
        '/console/health',
        t('reads', { count: o.readsThisMonth }),
        t('readsSub', { limit: o.aiLimit }),
      )}
      {stat('/console/health', t('inbound', { count: o.inboundThisWeek }), t('inboundSub'))}
      {stat('/console/households', t('waiting', { count: o.waiting }), t('waitingSub'))}
      <Card className="con-stat">
        <b>{build.commit === 'dev' ? 'dev' : shortSha(build.commit)}</b>
        <span className="muted small">{t('software')}</span>
      </Card>
    </div>
  );
}
