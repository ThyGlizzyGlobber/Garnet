import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Icon } from '@/components/app/icons';
import { PageTitle } from '@/components/ui/blocks';
import { viewerIsDeveloper } from '@/lib/auth/session';
import { pageContext } from '@/lib/context';
import { getEnv, isLlmConfigured } from '@/lib/env';
import { catchUpCount, isReadingMetrics } from '@/ingest/metrics';
import { regionalEnabled } from '@/lib/regional';
import { isAdmin } from '@/lib/roles';

/** A line in the list: a page of settings, what it's for, and whether this person can change it. */
interface SettingLink {
  href: string;
  icon: string;
  title: string;
  desc: string;
  /** Only admins change it: others see a lock and can look. */
  locked?: boolean;
}

/**
 * Household settings: a list of what can be set, in two columns (General,
 * Features; the developer's tools under them), each line opening its own
 * page (owner, 2026-10-02, after Xero's organisation settings). A line only
 * admins can change shows a lock for everyone else.
 */
export default async function SettingsPage() {
  const { hh, me } = await pageContext();
  const admin = isAdmin(me);
  const developer = await viewerIsDeveloper();
  const t = await getTranslations('settings');
  const ti = await getTranslations('settings.index');
  const row = (key: string, href: string, icon: string, locked = false): SettingLink => ({
    href,
    icon,
    title: ti(`${key}.title`),
    desc: ti(`${key}.desc`),
    locked: locked && !admin,
  });
  const catchUp =
    admin && isLlmConfigured(getEnv()) && (catchUpCount(hh.id) > 0 || isReadingMetrics(hh.id));

  const general: SettingLink[] = [
    row('household', '/settings/household', 'home', true),
    row('members', '/members', 'people'),
    row('billsAddress', '/settings/bills-address', 'mail'),
    row('location', '/settings/location', 'pin', true),
    row('account', '/account/profile', 'user'),
  ];
  const features: SettingLink[] = [
    row('notifications', '/settings/notifications', 'bell'),
    ...(regionalEnabled() ? [row('sharing', '/settings/sharing', 'chart', true)] : []),
    row('wall', '/wall', 'wall'),
    ...(catchUp ? [row('catchUp', '/settings/catch-up', 'layers')] : []),
    ...(hh.isDemo && admin ? [row('demo', '/settings/demo', 'logout')] : []),
  ];
  const tools: SettingLink[] = developer
    ? [
        row('update', '/settings/update', 'download'),
        row('system', '/settings/system', 'sliders'),
        row('console', '/console', 'shield'),
      ]
    : [];

  const list = (head: string, links: SettingLink[]) => (
    <section className="set-sec">
      <h2 className="set-sec-h">{head}</h2>
      <div className="glass rounded-card set-list">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="set-link">
            <span className="set-ic" aria-hidden="true">
              <Icon name={l.icon} width={18} height={18} />
            </span>
            <span className="set-link-t">
              <b>
                {l.locked && (
                  <Icon name="lock" width={13} height={13} className="set-lock" aria-hidden />
                )}
                {l.title}
              </b>
              <span>{l.desc}</span>
              {l.locked && <span className="set-only">{ti('adminOnly')}</span>}
            </span>
            <Icon name="chevron-right" width={16} height={16} className="set-chev" />
          </Link>
        ))}
      </div>
    </section>
  );

  return (
    <div className="scr settings">
      <PageTitle title={t('title')} lede={ti('lede', { household: hh.name })} />
      <div className="set-index">
        <div className="set-index-col">{list(ti('general'), general)}</div>
        <div className="set-index-col">
          {list(ti('features'), features)}
          {tools.length > 0 && list(ti('developer'), tools)}
        </div>
      </div>
    </div>
  );
}
