import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Card, PageHeader } from '@/components/ui';
import { BillsAddressCard } from '@/components/app/bills-address';
import { viewerIsOperator } from '@/lib/auth/session';
import { billsAddress } from '@/lib/bills-address';
import { pageContext } from '@/lib/context';
import { getEnv, isImapConfigured, isLlmConfigured } from '@/lib/env';
import { SettingsForm } from './settings-form';
import { InlineAction } from '@/components/ui/form';
import { getTheme, THEMES } from '@/lib/theme';
import { exitDemoAction, replaceBillsAddressAction, setThemeAction } from './actions';
import { UpdateCard } from './update-card';

export default async function SettingsPage() {
  const { hh, me } = await pageContext();
  const operator = await viewerIsOperator();
  const address = billsAddress(hh);
  const t = await getTranslations('settings');
  const env = getEnv();
  const theme = await getTheme();
  const demo = hh.isDemo;
  const months = Array.from({ length: 12 }, (_, i) =>
    new Intl.DateTimeFormat(hh.locale, { month: 'long' }).format(new Date(2026, i, 1)),
  );
  const days = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(hh.locale, { weekday: 'long' }).format(new Date(2026, 1, 1 + i)),
  );
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title={t('title')} subtitle={me.role === 'owner' ? undefined : t('ownerOnly')} />
      <SettingsForm
        readOnly={me.role !== 'owner'}
        timezones={Intl.supportedValuesOf('timeZone')}
        months={months}
        days={days}
        initial={{
          name: hh.name,
          currency: hh.currency,
          locale: hh.locale,
          timezone: hh.timezone,
          fiscalYearStartMonth: hh.fiscalYearStartMonth,
          weekStartsOn: hh.weekStartsOn,
          splitMode: hh.splitMode,
          paymentReferenceTemplate: hh.paymentReferenceTemplate,
        }}
      />
      <Card className="mt-4 flex flex-col gap-3">
        <h2 className="font-display font-semibold">{t('theme.title')}</h2>
        <p className="text-xs text-fg-muted">{t('theme.body')}</p>
        <form action={setThemeAction} className="flex flex-wrap gap-2">
          {THEMES.map((th) => (
            <button
              key={th}
              name="theme"
              value={th}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${theme === th ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-fg-muted hover:text-fg'}`}
            >
              {t(`theme.${th}`)}
            </button>
          ))}
        </form>
      </Card>
      {demo && me.role === 'owner' && (
        <Card className="mt-4 flex flex-col gap-3 border-warning/40 bg-warning-soft">
          <h2 className="font-display font-semibold">{t('demo.title')}</h2>
          <p className="text-xs text-fg-muted">{t('demo.body')}</p>
          <InlineAction
            action={exitDemoAction}
            label={t('demo.exit')}
            variant="danger"
            confirm={t('demo.confirm')}
          />
        </Card>
      )}
      {address && (
        <div className="mt-4">
          <BillsAddressCard
            address={address}
            replaceAction={me.role === 'owner' ? replaceBillsAddressAction : undefined}
          />
        </div>
      )}
      {operator && <UpdateCard hh={hh} />}
      <Card className="mt-4">
        <h2 className="font-semibold">
          <Link href="/status" className="text-accent">
            {t('system.title')} →
          </Link>
        </h2>
        <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
          <dt className="text-fg-muted">{t('system.dataDir')}</dt>
          <dd className="truncate font-mono text-xs">{env.DATA_DIR}</dd>
          <dt className="text-fg-muted">{t('system.mailbox')}</dt>
          <dd>{isImapConfigured(env) ? t('system.configured') : t('system.notConfigured')}</dd>
          <dt className="text-fg-muted">{t('system.llm')}</dt>
          <dd>{isLlmConfigured(env) ? t('system.configured') : t('system.notConfigured')}</dd>
          <dt className="text-fg-muted">{t('system.demoMode')}</dt>
          <dd>{env.DEMO_MODE ? t('system.on') : t('system.off')}</dd>
        </dl>
      </Card>
    </div>
  );
}
