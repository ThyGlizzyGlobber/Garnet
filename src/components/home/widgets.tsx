import type { ReactNode } from 'react';
import { SIZE_LIST, sizeName } from '@/lib/home-grid';
import type { HomeData } from '@/lib/home-data';
import { colourCss } from '@/lib/palette';
import { weatherCodeKey } from '@/lib/weather-codes';
import type { WidgetCtx, WidgetDef } from './catalog';
import { WxBars, WxCard, WxFig, WxKv, WxRow, WxRows, type WxSize, type WxSpec } from './pieces';

/**
 * The widgets drawn in the three sizes (SCOPE-widgets.md §3f): each works out
 * a WxSpec of formatted words from the Home data and WxCard lays it out.
 */
const SIZE = { small: 's', medium: 'm', large: 'l' } as const;
const sizeOf = (c: WidgetCtx): WxSize => SIZE[sizeName(c.w, c.h)];
const card = (c: WidgetCtx, spec: WxSpec | null): ReactNode =>
  spec && <WxCard spec={spec} size={sizeOf(c)} />;

const fig = (c: WidgetCtx, minor: number) => {
  const p = c.f.moneyParts(minor);
  return <WxFig main={p.main} minor={p.minor + p.tail} />;
};

const wxIcon: Record<string, string> = {
  clear: 'sun',
  partly: 'cloud-sun',
  cloudy: 'cloud',
  fog: 'cloud',
  drizzle: 'cloud-rain',
  rain: 'cloud-rain',
  snow: 'cloud-rain',
  storm: 'cloud-rain',
  unknown: 'cloud',
};

/** A countdown ring: fuller as the day comes, over a fortnight. */
const countdown = (days: number) => Math.max(0.05, 1 - Math.min(days, 14) / 14);

function daysInstrument(c: WidgetCtx, days: number): WxSpec['instrument'] {
  if (days < 0)
    return { kind: 'ring', value: 1, big: String(-days), small: c.t('wx.daysOver', { n: -days }) };
  if (days === 0) return { kind: 'ring', value: 1, big: c.t('rel.today') };
  return {
    kind: 'ring',
    value: countdown(days),
    big: String(days),
    small: c.t('wx.daysLeft', { n: days }),
  };
}

/** This month: how much of what's due the provider already has. */
function monthSpec(c: WidgetCtx): WxSpec {
  const { d, t, f } = c;
  const m = d.month;
  const pct = m.dueMinor > 0 ? m.paidMinor / m.dueMinor : 0;
  const allPaid = m.bills > 0 && m.paidBills === m.bills;
  const months = d.monthly.slice(-6);
  const top = m.byService
    .map((x) => ({ s: d.services.find((s) => s.id === x.id), v: x.minor }))
    .filter((x): x is { s: HomeData['services'][number]; v: number } => !!x.s && x.v > 0)
    .sort((a, b) => b.v - a.v)
    .slice(0, 3);
  return {
    instrument: allPaid
      ? { kind: 'ring', value: 1, icon: 'check' }
      : { kind: 'ring', value: pct, big: `${Math.round(pct * 100)}%`, small: t('wx.paidLow') },
    cap: [f.money(m.knownMinor, true), allPaid ? t('wx.allPaid') : f.monthName(m.month)],
    title: f.monthName(m.month),
    figure: fig(c, m.knownMinor),
    facts: [
      { label: t('wx.paid'), value: f.money(m.paidMinor) },
      { label: t('wx.toPay'), value: f.money(m.dueMinor - m.paidMinor) },
    ],
    body: (
      <>
        <WxBars
          values={months.map((x) => x.totalMinor)}
          labels={months.map((x) => f.mon(x.month))}
        />
        <WxRows>
          {top.map(({ s, v }) => (
            <WxRow
              key={s.id}
              colour={colourCss(s.colour)}
              title={s.name}
              value={f.money(v)}
              href={`/services/${s.id}`}
            />
          ))}
        </WxRows>
      </>
    ),
    href: '/bills',
  };
}

/** What the viewer pays next, counted down; red once it is late. */
function nextDueSpec(c: WidgetCtx): WxSpec {
  const { d, t, f } = c;
  const first = d.upcoming[0];
  if (!first) {
    const next = d.forecast[0];
    return {
      instrument: { kind: 'ring', value: 0, icon: 'check' },
      cap: [t('wx.nothingDue'), next ? f.monthName(next.month) : ''],
      title: t('nextdue.title'),
      figure: <WxFig main={t('wx.nothingDue')} />,
      facts: next
        ? [{ label: f.monthName(next.month), value: `≈ ${f.money(next.totalMinor, true)}` }]
        : [],
      href: '/bills',
    };
  }
  const late = first.days < 0;
  const who =
    first.kind === 'yours'
      ? t('up.yours')
      : first.kind === 'you-pay'
        ? t('wx.youPay')
        : t('up.shareTo', { name: first.payerName ?? '' });
  const pay =
    first.kind === 'share' && first.shareId && c.onMarkPaid
      ? () => c.onMarkPaid!(first.shareId!, first.billId)
      : null;
  return {
    colour: colourCss(first.colour),
    overdue: late,
    instrument: daysInstrument(c, first.days),
    cap: [f.money(first.amountMinor), first.serviceName],
    title: late ? t('wx.overdue') : t('nextdue.title'),
    figure: fig(c, first.amountMinor),
    facts: [
      {
        label: first.serviceName,
        value: late ? t('wx.over', { n: -first.days }) : f.rel(first.dueDate),
        tone: late ? 'overdue' : first.days <= 7 ? 'warn' : undefined,
      },
      {
        label: who,
        value: first.instalment
          ? `${first.instalment.n} / ${first.instalment.of}`
          : f.date(first.dueDate),
      },
    ],
    body: (
      <WxRows>
        {d.upcoming.slice(1, 4).map((u) => (
          <WxRow
            key={`${u.billId}:${u.instalment?.n ?? 0}`}
            colour={colourCss(u.colour)}
            title={u.serviceName}
            sub={f.rel(u.dueDate)}
            value={f.money(u.amountMinor)}
            href={`/bills/${u.billId}`}
          />
        ))}
      </WxRows>
    ),
    action: pay ? { icon: 'check', label: t('nextdue.markPaid'), onClick: pay } : undefined,
    href: `/bills/${first.billId}`,
  };
}

/** Settle up: this month's shares paid, and what is owed either way. */
function owesSpec(c: WidgetCtx): WxSpec | null {
  const { d, t, f } = c;
  const m = d.money;
  if (!m) return null;
  const st = d.settled;
  const done = !st || st.total === 0 || st.paid === st.total;
  const owed = m.owedToYou >= m.youOwe;
  const net = Math.abs(m.owedToYou - m.youOwe);
  const quiet = m.owedToYou === 0 && m.youOwe === 0;
  return {
    colour: 'var(--ok)',
    instrument:
      done || !st
        ? { kind: 'ring', value: 1, icon: 'check' }
        : {
            kind: 'ring',
            value: st.paid / st.total,
            big: `${st.paid} / ${st.total}`,
            small: t('wx.sharesPaid'),
          },
    cap: quiet
      ? [t('wx.allSettled'), t('owes.title')]
      : [f.money(net), owed ? t('wx.owedToYou') : t('wx.youOwe')],
    title: t('owes.title'),
    figure: quiet ? <WxFig main={t('wx.allSettled')} /> : fig(c, net),
    facts: [
      { label: t('wx.owedToYou'), value: f.money(m.owedToYou) },
      { label: t('wx.youOwe'), value: f.money(m.youOwe) },
    ],
    body: (
      <WxRows>
        {m.people.slice(0, 3).map((p) => {
          const mem = d.members.find((x) => x.id === p.memberId);
          if (!mem) return null;
          return (
            <WxRow
              key={p.memberId}
              colour={colourCss(mem.colour)}
              title={mem.name}
              sub={
                p.owesYou && p.youOwe
                  ? t('owes.both', { owes: f.money(p.owesYou), owe: f.money(p.youOwe) })
                  : p.owesYou
                    ? t('owes.owesYou', { amount: f.money(p.owesYou) })
                    : t('owes.youOwe', { amount: f.money(p.youOwe) })
              }
              value={`${p.net >= 0 ? '+' : '−'}${f.money(Math.abs(p.net))}`}
              href="/money"
            />
          );
        })}
      </WxRows>
    ),
    action: quiet ? undefined : { icon: 'check', label: t('owes.settle'), href: '/money' },
    href: '/money',
  };
}

/** Today's weather, and what the week's heating or cooling will cost. */
function weatherSpec(c: WidgetCtx): WxSpec | null {
  const { d, t, f } = c;
  const wx = d.weather;
  const today = wx?.days[0];
  if (!wx || !today) return null;
  const deg = (n: number | null) => `${n === null ? '–' : Math.round(n)}°`;
  const sky = (code: number | null) => t(`weather.code.${weatherCodeKey(code)}`);
  const need = wx.impact?.kind === 'cooling' ? 'cool' : 'heat';
  const days = wx.days.filter((x) => x.need === need).length;
  const daysFact = {
    label: t(need === 'cool' ? 'wx.coolingDays' : 'wx.heatingDays'),
    value: t('wx.nOfN', { n: days, of: wx.days.length }),
  };
  return {
    colour: 'var(--sc-blue)',
    instrument: {
      kind: 'plain',
      icon: wxIcon[weatherCodeKey(today.code)] ?? 'cloud',
      big: deg(today.hi),
      small: sky(today.code),
    },
    cap: [wx.place ?? t('weather.title'), t('wx.low', { lo: deg(today.lo) })],
    title: wx.impact
      ? t(wx.impact.kind === 'cooling' ? 'wx.coolingWeek' : 'wx.heatingWeek')
      : (wx.place ?? t('weather.title')),
    figure: wx.impact ? (
      <WxFig
        main={`${wx.impact.vsNormal ? (wx.impact.minor >= 0 ? '+' : '−') : '≈'} ${f.money(Math.abs(wx.impact.minor), true)}`}
      />
    ) : (
      <WxFig main={`${deg(today.hi)} / ${deg(today.lo)}`} />
    ),
    facts: [
      ...(wx.impact?.vsNormal ? [{ label: t('wx.against'), value: t('wx.normalWeek') }] : []),
      { label: t('wx.lowTonight'), value: deg(today.lo) },
      daysFact,
    ].slice(0, 2),
    body: (
      <WxRows>
        {wx.days.slice(1, 5).map((x) => (
          <WxRow
            key={x.date}
            colour={
              x.need === 'heat'
                ? 'var(--warn)'
                : x.need === 'cool'
                  ? 'var(--sc-blue)'
                  : 'var(--line-2)'
            }
            title={f.weekday(x.date)}
            sub={sky(x.code)}
            value={deg(x.hi)}
            note={deg(x.lo)}
          />
        ))}
      </WxRows>
    ),
  };
}

/** The Inbox: what is waiting to be confirmed. */
function inboxSpec(c: WidgetCtx): WxSpec {
  const { d, t, f } = c;
  const ib = d.inbox;
  const newest = ib.recent[0];
  return {
    instrument: { kind: 'plain', icon: 'inbox', big: String(ib.needs), small: t('wx.toConfirm') },
    cap: [t('inbox.title'), t('wx.filedWeek', { n: ib.analysedThisWeek })],
    title: t('inbox.title'),
    facts: [
      { label: t('wx.filed'), value: String(ib.analysedThisWeek) },
      ...(newest ? [{ label: t('wx.newest'), value: f.rel(newest.date) }] : []),
    ],
    body: (
      <WxRows>
        {ib.recent.slice(0, 4).map((x) => (
          <WxRow
            key={x.documentId}
            title={x.title}
            sub={`${t(`how.${x.how}`, { name: x.memberName ?? '' })} · ${f.date(x.date)}`}
            value={
              x.needs ? t('inbox.confirm') : x.state === 'failed' ? t('wx.tryAgain') : undefined
            }
            href={x.billId ? `/bills/${x.billId}` : `/inbox/${x.documentId}`}
          />
        ))}
      </WxRows>
    ),
    href: '/inbox',
  };
}

/**
 * One service. What leads it, in order: overdue; its usage a day (a gauge
 * against the limit, or the reading alone when no limit is set); housemates'
 * shares still to come in; the days until its bill is due; or paid.
 */
function serviceSpec(c: WidgetCtx, s: HomeData['services'][number]): WxSpec {
  const { t, f } = c;
  const colour = colourCss(s.colour);
  const href = `/services/${s.id}`;
  const months = c.d.monthly.slice(-6);
  if (!s.latest)
    return {
      colour,
      instrument: { kind: 'ring', value: 0, icon: s.icon, filled: true },
      cap: [s.name, t('wx.addToStart')],
      title: s.name,
      figure: <WxFig main={t('wx.noBills')} />,
      facts: [{ label: t('wx.toStart'), value: t('wx.addBill') }],
      action: { icon: 'plus', label: t('wx.addBill'), href: '/bills/upload' },
      href,
    };
  const st = s.latest.status;
  const late = st.key === 'overdue';
  const unpaid = st.key !== 'paid';
  const u = s.usage;
  const num = (n: number) => f.num(n);
  let instrument: WxSpec['instrument'];
  if (late) instrument = daysInstrument(c, st.days);
  else if (u && u.limitPerDay)
    instrument = {
      kind: 'ring',
      gauge: true,
      value: u.perDay / u.limitPerDay,
      big: num(u.perDay),
      unit: u.unit,
      small: t('wx.aDay'),
    };
  else if (u)
    instrument = {
      kind: 'plain',
      icon: s.icon,
      big: num(u.perDay),
      small: t('wx.unitADay', { unit: u.unit }),
      compact: true,
    };
  else if (unpaid && s.shares && s.shares.paid < s.shares.total)
    instrument = {
      kind: 'ring',
      value: s.shares.paid / s.shares.total,
      big: `${s.shares.paid} / ${s.shares.total}`,
      small: t('wx.paidLow'),
    };
  else if (unpaid) instrument = daysInstrument(c, st.days);
  else instrument = { kind: 'ring', value: 1, icon: 'check' };
  const status = t(`status.${st.key}`, { n: Math.abs(st.days), date: f.date(st.dueDate) });
  return {
    colour,
    overdue: late,
    instrument,
    cap: [f.money(s.latest.amountMinor), s.name],
    title: s.name,
    figure: fig(c, s.latest.amountMinor),
    facts: [
      u?.limitPerDay
        ? {
            label: t('wx.limit'),
            value: t('wx.limitValue', { n: num(u.limitPerDay), unit: u.unit }),
          }
        : { label: t('services.latestBill'), value: status, tone: late ? 'overdue' : undefined },
      (u?.vsLastYear ?? s.vsLastYear) !== null
        ? { label: t('wx.onLastYear'), value: f.pct((u?.vsLastYear ?? s.vsLastYear)!) }
        : { label: t('services.thisMonth'), value: f.money(s.thisMonthMinor) },
    ],
    body: (
      <>
        <WxBars values={s.spark.slice(-6)} labels={months.map((x) => f.mon(x.month))} />
        <WxRows>
          <WxKv
            label={t('services.latestBill')}
            value={status}
            tone={late ? 'overdue' : undefined}
          />
          <WxKv label={t('services.thisMonth')} value={f.money(s.thisMonthMinor)} />
          {s.shares && (
            <WxKv label={t('wx.sharesPaidLabel')} value={`${s.shares.paid} / ${s.shares.total}`} />
          )}
        </WxRows>
      </>
    ),
    href,
  };
}

const def = (id: string, icon: string, spec: (c: WidgetCtx) => WxSpec | null): WidgetDef => ({
  id,
  icon,
  sizes: SIZE_LIST,
  render: (c) => card(c, spec(c)),
});

/** The six core widgets (W2). */
export const CORE_WIDGETS: WidgetDef[] = [
  def('month', 'calendar', monthSpec),
  def('weather', 'cloud-sun', weatherSpec),
  def('nextdue', 'clock', nextDueSpec),
  def('owes', 'money', owesSpec),
  def('inbox', 'inbox', inboxSpec),
];

/** One widget per household service (its id is svc-<service id>). */
export const serviceWidget = (s: HomeData['services'][number]): WidgetDef =>
  def(`svc-${s.id}`, s.icon, (c) => serviceSpec(c, s));
