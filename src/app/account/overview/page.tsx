import { getTranslations } from 'next-intl/server';
import { Icon } from '@/components/app/icons';
import { Card } from '@/components/ui';
import { EmptyCard, PageTitle, SectionHead, Stats } from '@/components/ui/blocks';
import { Chip, StatusChip, type Tone } from '@/components/ui/chip';
import { Avatars } from '@/components/ui/colour';
import { roleKey, typeIcon } from '@/lib/household-types';
import { formatMoney } from '@/lib/format';
import { switchHouseholdAction } from '../actions';
import { accountContext } from '../context';

const TONE: Record<string, Tone> = {
  overdue: 'bad',
  today: 'warn',
  tomorrow: 'warn',
  soon: 'warn',
  due: 'neutral',
  paid: 'ok',
};

/**
 * Every household at once (owner, 2026-10-02): what you owe across them,
 * this month's bills, what's overdue and what's waiting; a row per
 * household; and the bills that matter next, from all of them. Numbers from
 * accountView().
 */
export default async function OverviewPage() {
  const { view, locale } = await accountContext();
  const t = await getTranslations('accountOverview');
  const tr = await getTranslations('roles');
  const money = (minor: number, currency: string, loc: string) =>
    formatMoney(minor, currency, loc, { whole: minor >= 100_000 });
  const all = (x: { minor: number; currency: string; locale: string } | null) =>
    x ? money(x.minor, x.currency, x.locale) : '—';
  const date = (iso: string) =>
    new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(
      new Date(`${iso}T00:00:00`),
    );
  const when = (days: number) =>
    days < 0
      ? t('daysLate', { count: -days })
      : days === 0
        ? t('today')
        : t('daysTo', { count: days });

  return (
    <div className="scr account pf">
      <PageTitle title={t('title')} lede={t('lede', { count: view.tiles.length })} />
      {view.tiles.length === 0 ? (
        <EmptyCard icon="grid" title={t('emptyTitle')} body={t('emptyBody')} />
      ) : (
        <>
          <Card>
            <Stats
              stats={[
                {
                  label: t('owe'),
                  value: all(view.oweAll),
                  sub: view.oweAll ? t('oweSub') : t('mixed'),
                },
                {
                  label: t('month'),
                  value: all(view.monthAll),
                  sub: view.monthAll ? t('monthSub') : t('mixed'),
                },
                { label: t('overdue'), value: String(view.overdueAll), sub: t('overdueSub') },
                { label: t('waiting'), value: String(view.waitingAll), sub: t('waitingSub') },
              ]}
            />
          </Card>

          <section className="mt-2">
            <SectionHead title={t('byHousehold')} />
            <div className="glass rounded-card ov-table" role="table">
              <div className="ov-row ov-h" role="row">
                <span role="columnheader">{t('col.household')}</span>
                <span role="columnheader">{t('col.month')}</span>
                <span role="columnheader">{t('col.owe')}</span>
                <span role="columnheader">{t('col.attention')}</span>
              </div>
              {view.tiles.map((h) => (
                <form key={h.memberId} action={switchHouseholdAction} role="row">
                  <input type="hidden" name="memberId" value={h.memberId} />
                  <button
                    type="submit"
                    className="ov-row"
                    aria-label={t('open', { household: h.name })}
                  >
                    <span className="ov-hh" role="cell">
                      <span className="set-ic" aria-hidden="true">
                        <Icon name={typeIcon(h.type)} width={16} height={16} />
                      </span>
                      <span className="ov-hh-t">
                        <b>
                          {h.name}
                          {h.primary && (
                            <Icon name="home" width={12} height={12} className="ov-home" />
                          )}
                        </b>
                        <span className="ov-hh-m">
                          <Chip tone="neutral">{tr(roleKey(h.role, h.type))}</Chip>
                          <Avatars members={h.people} size="sm" />
                        </span>
                      </span>
                    </span>
                    <span role="cell" className="fig" data-label={t('col.month')}>
                      {money(h.monthMinor, h.currency, h.locale)}
                    </span>
                    <span role="cell" className="fig" data-label={t('col.owe')}>
                      {h.split ? money(h.oweMinor, h.currency, h.locale) : '—'}
                    </span>
                    <span role="cell" className="ov-att" data-label={t('col.attention')}>
                      {h.overdue > 0 && (
                        <StatusChip
                          status={{ label: t('overdueN', { count: h.overdue }), tone: 'bad' }}
                        />
                      )}
                      {h.waiting > 0 && (
                        <StatusChip
                          status={{ label: t('waitingN', { count: h.waiting }), tone: 'info' }}
                        />
                      )}
                      {!h.overdue && !h.waiting && (
                        <StatusChip status={{ label: t('allClear'), tone: 'ok' }} />
                      )}
                    </span>
                  </button>
                </form>
              ))}
            </div>
          </section>

          {view.recent.length > 0 && (
            <section className="mt-2">
              <SectionHead title={t('recent')} />
              <div className="glass rounded-card ov-table">
                {view.recent.map((b) => (
                  <div key={b.id} className="ov-row ov-bill">
                    <span className="ov-hh-t">
                      <b>{b.service}</b>
                      <span className="muted small">
                        {[b.provider, b.household].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <span className="muted small">
                      {date(b.dueDate)} · {when(b.days)}
                    </span>
                    <span className="fig">{money(b.amountMinor, b.currency, b.locale)}</span>
                    <span className="ov-att">
                      <StatusChip
                        status={{
                          label: t(`status.${b.status}`),
                          tone: TONE[b.status] ?? 'neutral',
                        }}
                      />
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
