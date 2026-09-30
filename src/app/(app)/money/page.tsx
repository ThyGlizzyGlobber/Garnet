import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { relativeDay, rowCtx } from '@/components/app/bill-rows';
import { Button, Card, LinkButton } from '@/components/ui';
import { EmptyCard, Money, PageTitle, SectionHead } from '@/components/ui/blocks';
import { Chip } from '@/components/ui/chip';
import { Avatar, Disc } from '@/components/ui/colour';
import { Ring } from '@/components/ui/ring';
import { pageContext } from '@/lib/context';
import { daysBetween } from '@/lib/dates';
import { formatMonthRange } from '@/lib/format';
import { colourCss } from '@/lib/palette';
import { isAdmin } from '@/lib/roles';
import { moneyView, type Debt } from '@/lib/money';
import { toggleSharePaidAction } from '../bills/actions';
import { MoneyActions } from './money-actions';

/**
 * Money: who owes whom in the house, from the viewer's side. A settle-up
 * hero with the two actions (D9), a card per housemate, then what the viewer
 * owes, what is owed to them, and what is owed between the others. Numbers
 * from moneyView() (src/lib/money.ts).
 */
export default async function MoneyPage() {
  const ctx = await pageContext();
  const { hh, me, money, month } = ctx;
  const t = await getTranslations('money');
  const tu = await getTranslations('ui');
  const rc = rowCtx(ctx, tu);
  if (hh.splitMode !== 'shared')
    return (
      <div className="scr">
        <PageTitle title={t('title')} lede={t('ledeShort')} />
        <EmptyCard icon="money" title={t('notSplit.title')} body={t('notSplit.body')}>
          <LinkButton href="/settings" variant="secondary" icon="sliders">
            {t('notSplit.settings')}
          </LinkButton>
        </EmptyCard>
      </div>
    );
  const v = moneyView(hh.id, me.id, ctx.today, hh.fiscalYearStartMonth);
  const name = (id: string) => v.people.find((p) => p.member.id === id)?.member.name ?? '';
  const anything = v.youOwe.length + v.owedToYou.length + v.between.length > 0;

  const heroLine =
    v.netMinor >= 0
      ? v.youOweMinor > 0
        ? t('hero.owedAfter', {
            amount: money(v.youOweMinor),
            names: new Intl.ListFormat(hh.locale, { type: 'conjunction' }).format(
              v.creditors.map((c) => c.member.name),
            ),
          })
        : v.owedToYouMinor > 0
          ? t('hero.owed')
          : t('hero.square')
      : t('hero.youOweAfter', { amount: money(v.owedToYouMinor) });

  const debtRow = (d: Debt, dir: 'out' | 'in') => {
    const other = name(dir === 'out' ? d.toId : d.fromId);
    const days = daysBetween(ctx.today, d.dueDate);
    return (
      <div key={d.shareId} className="debt-row">
        <Link
          href={`/bills/${d.billId}`}
          className="debt-main"
          style={{ ['--svc' as string]: colourCss(d.colour) }}
        >
          <Disc icon={d.icon} colour={d.colour} size="sm" />
          <span>
            <b className="truncate">
              {d.serviceName}
              {d.instalment ? ` · ${t('instalment', { n: d.instalment })}` : ''}
            </b>
            <span className="muted truncate">
              {t(dir === 'out' ? 'to' : 'from', { name: other })} ·{' '}
              {relativeDay(rc, days, d.dueDate)}
            </span>
          </span>
        </Link>
        <span className="debt-amt">{money(d.amountMinor, d.currency)}</span>
        <form action={toggleSharePaidAction}>
          <input type="hidden" name="shareId" value={d.shareId} />
          <input type="hidden" name="billId" value={d.billId} />
          <input type="hidden" name="paid" value="true" />
          <Button
            type="submit"
            size="sm"
            variant={dir === 'out' ? 'primary' : 'secondary'}
            icon={dir === 'in' ? 'check' : undefined}
          >
            {dir === 'out' ? t('markPaid') : t('paid')}
          </Button>
        </form>
      </div>
    );
  };

  const owedForSheet = v.owedToYou.map((d) => ({
    shareId: d.shareId,
    fromId: d.fromId,
    serviceName: d.serviceName,
    icon: d.icon,
    colour: d.colour,
    amountMinor: d.amountMinor,
    currency: d.currency,
    sub: `${formatMonthRange(d.periodStart, d.periodEnd, hh.locale)} · ${t('dueOn', { date: rc.date(d.dueDate) })}`,
    instalment: d.instalment,
  }));

  return (
    <div className="scr d3-money">
      <PageTitle title={t('title')} lede={t('lede')} />
      <Card className="d3-money-hero">
        <div className="mh">
          <div className="eyebrow">{t('settleUp')}</div>
          <Money
            minor={Math.abs(v.netMinor)}
            currency={hh.currency}
            locale={hh.locale}
            className="hero-fig"
          />
          <p className="mh-line">{heroLine}</p>
          <MoneyActions
            people={v.people.map((p) => ({
              id: p.member.id,
              name: p.member.name,
              colour: p.member.colour,
            }))}
            owed={owedForSheet}
            today={ctx.today}
            locale={hh.locale}
            canRemind={v.owedToYou.length > 0}
          />
        </div>
      </Card>

      {v.people.length > 0 && (
        <div className="d3-people">
          {v.people.map((p) => {
            const pct = p.sharesThisFy ? Math.round((p.paidThisFy / p.sharesThisFy) * 100) : 100;
            return (
              <Card
                key={p.member.id}
                className="person"
                style={{ ['--m' as string]: colourCss(p.member.colour) }}
              >
                <div className="person-top">
                  <Avatar name={p.member.name} colour={p.member.colour} size="lg" />
                  <div>
                    <b>{p.member.name}</b>
                    <span className="muted small">
                      {isAdmin(p.member) ? t('admin') : t('member')} ·{' '}
                      {t('since', { date: month(p.member.activeFrom.slice(0, 7), 'long-year') })}
                    </span>
                  </div>
                </div>
                <div className="person-body">
                  <Ring pct={pct} size={70} from={colourCss(p.member.colour)}>
                    <b className="text-sm">{pct}%</b>
                  </Ring>
                  <div className="person-t">
                    <span className={`person-net ${p.netMinor >= 0 ? 'pos' : 'neg'}`}>
                      {p.netMinor > 0
                        ? t('owesYou', { amount: money(p.netMinor) })
                        : p.netMinor < 0
                          ? t('youOwe', { amount: money(-p.netMinor) })
                          : t('square')}
                    </span>
                    <span className="muted small">
                      {t('paidBack', { paid: p.paidThisFy, total: p.sharesThisFy })}
                    </span>
                  </div>
                </div>
                {p.member.paymentDetails.length > 0 && (
                  <div className="person-pay">
                    {p.member.paymentDetails.map((d) => (
                      <span key={d.label} className="contents">
                        <span className="muted small">{d.label}</span>
                        <span className="mono small">{d.value}</span>
                      </span>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {anything ? (
        <div className="d3-money-cols">
          <Card>
            <SectionHead
              title={t('youOweHead')}
              right={<span className="muted">{money(v.youOweMinor)}</span>}
            />
            <div className="debts">
              {v.youOwe.length ? (
                v.youOwe.map((d) => debtRow(d, 'out'))
              ) : (
                <p className="muted">{t('squareAll')}</p>
              )}
            </div>
          </Card>
          <Card>
            <SectionHead
              title={t('owedToYouHead')}
              right={<span className="muted">{money(v.owedToYouMinor)}</span>}
            />
            <div className="debts">
              {v.owedToYou.length ? (
                v.owedToYou.map((d) => debtRow(d, 'in'))
              ) : (
                <p className="muted">{t('nobodyOwes')}</p>
              )}
            </div>
          </Card>
          {v.between.length > 0 && (
            <Card>
              <SectionHead title={t('betweenHead')} />
              <div className="debts">
                {v.between.map((d) => (
                  <Link key={d.shareId} href={`/bills/${d.billId}`} className="between">
                    <Avatar
                      name={name(d.fromId)}
                      colour={
                        v.people.find((p) => p.member.id === d.fromId)?.member.colour ?? '#888'
                      }
                      size="sm"
                    />
                    <span>
                      {t('betweenLine', {
                        from: name(d.fromId),
                        to: name(d.toId),
                        service: d.serviceName,
                      })}
                    </span>
                    <b>{money(d.amountMinor, d.currency)}</b>
                    {d.dueDate < ctx.today ? (
                      <Chip tone="bad" icon="alert">
                        {t('overdue')}
                      </Chip>
                    ) : (
                      <span />
                    )}
                  </Link>
                ))}
              </div>
            </Card>
          )}
        </div>
      ) : (
        <EmptyCard icon="money" title={t('empty.title')} body={t('empty.body')} />
      )}
    </div>
  );
}
