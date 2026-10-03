import type { ReactNode } from 'react';
import { addDays } from '@/lib/dates';
import { SIZE_LIST, sizeName } from '@/lib/home-grid';
import type { HomeData } from '@/lib/home-data';
import { colourCss } from '@/lib/palette';
import { weatherCodeKey } from '@/lib/weather-codes';
import type { WidgetCtx, WidgetDef } from './catalog';
import {
  WxActs,
  WxBars,
  WxBig,
  WxCal,
  WxCard,
  WxFig,
  WxKv,
  WxNote,
  WxRow,
  WxRows,
  type WxSize,
  type WxSpec,
} from './pieces';

/**
 * Home's widgets (SCOPE-widgets.md §3f): each works out a WxSpec of formatted
 * words from the Home data and WxCard lays it out at Small, Medium or Large.
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

const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
const arrow = (f: number) =>
  `${f > 0 ? '↑' : f < 0 ? '↓' : ''} ${Math.round(Math.abs(f) * 100)}%`.trim();

/** Monthly cost: this month against last, then the months behind it. */
function trendSpec(c: WidgetCtx): WxSpec | null {
  const { d, t, f } = c;
  const all = d.monthly;
  const billed = all.filter((x) => x.totalMinor > 0);
  if (billed.length < 2) return null;
  const m = d.month;
  const six = all.slice(-6);
  const hi = billed.reduce((a, b) => (b.totalMinor > a.totalMinor ? b : a));
  const lo = billed.reduce((a, b) => (b.totalMinor < a.totalMinor ? b : a));
  const total = all.reduce((a, b) => a + b.totalMinor, 0);
  const last = all.at(-2);
  return {
    instrument: {
      kind: 'plain',
      icon: m.vsLastMonth !== null && m.vsLastMonth < 0 ? 'trend-down' : 'trend-up',
      big: m.vsLastMonth === null ? '–' : arrow(m.vsLastMonth),
      small: last ? t('wx.onMonth', { month: f.monthName(last.month) }) : '',
      compact: true,
    },
    cap: [f.money(m.knownMinor, true), f.monthName(m.month)],
    title: t('trend.title'),
    figure: (
      <WxBars values={six.map((x) => x.totalMinor)} labels={six.map((x) => f.mon(x.month))} />
    ),
    body: (
      <WxRows>
        <WxKv
          label={t('wx.highest')}
          value={`${f.mon(hi.month)} · ${f.money(hi.totalMinor, true)}`}
        />
        <WxKv
          label={t('wx.lowest')}
          value={`${f.mon(lo.month)} · ${f.money(lo.totalMinor, true)}`}
        />
        <WxKv label={t('wx.average')} value={f.money(Math.round(total / billed.length), true)} />
        <WxKv label={t('wx.twelveMonths')} value={f.money(total, true)} />
      </WxRows>
    ),
    href: '/bills',
  };
}

/** Every service and what it's costing this month. */
function servicesSpec(c: WidgetCtx): WxSpec | null {
  const { d, t, f } = c;
  if (!d.services.length) return null;
  const top = [...d.services].sort((a, b) => b.thisMonthMinor - a.thisMonthMinor);
  return {
    instrument: {
      kind: 'plain',
      icon: 'services',
      big: String(d.services.length),
      small: t('wx.servicesLow'),
    },
    cap: [f.money(d.month.knownMinor, true), t('services.thisMonthLow')],
    title: t('services.title'),
    facts: top.slice(0, 3).map((s) => ({ label: s.name, value: f.money(s.thisMonthMinor) })),
    body: (
      <WxRows>
        {top.slice(0, 4).map((s) => (
          <WxRow
            key={s.id}
            colour={colourCss(s.colour)}
            title={s.name}
            sub={
              s.latest
                ? t(`status.${s.latest.status.key}`, {
                    n: Math.abs(s.latest.status.days),
                    date: f.date(s.latest.status.dueDate),
                  })
                : t('wx.noBills')
            }
            value={f.money(s.thisMonthMinor)}
            href={`/services/${s.id}`}
          />
        ))}
      </WxRows>
    ),
    href: '/services',
  };
}

/** Usage a day against the household's limit. */
function usageSpec(c: WidgetCtx): WxSpec | null {
  const { d, t, f } = c;
  const u = d.usage;
  if (!u) return null;
  const pct = u.limitPerDay ? u.perDay / u.limitPerDay : null;
  return {
    colour: colourCss(u.colour),
    instrument:
      pct !== null
        ? {
            kind: 'ring',
            gauge: true,
            value: pct,
            big: `${Math.round(pct * 100)}%`,
            small: t('wx.ofLimit'),
          }
        : {
            kind: 'plain',
            icon: u.icon,
            big: f.num(u.perDay),
            small: t('wx.unitADay', { unit: u.unit }),
            compact: true,
          },
    cap: [`${f.num(u.perDay)} ${u.unit}`, t('wx.aDay')],
    title: u.serviceName,
    figure: <WxFig main={f.num(u.perDay)} minor={` ${t('wx.unitADay', { unit: u.unit })}`} />,
    facts: [
      ...(u.limitPerDay
        ? [
            {
              label: t('wx.limit'),
              value: t('wx.limitValue', { n: f.num(u.limitPerDay), unit: u.unit }),
            },
          ]
        : []),
      ...(u.vsLastYear !== null
        ? [
            {
              label: t('wx.onLastYear'),
              value: arrow(u.vsLastYear),
              tone: u.vsLastYear <= 0 ? ('ok' as const) : undefined,
            },
          ]
        : []),
    ],
    body: (
      <>
        <WxBars values={u.spark} labels={u.spark.map(() => '')} />
        <WxRows>
          {u.limitMonthly !== null && (
            <WxKv
              label={t('usage.yourLimit')}
              value={t('wx.aMonth', { n: f.num(u.limitMonthly), unit: u.unit })}
            />
          )}
          {u.vsLastYear !== null && (
            <WxKv label={t('usage.lastYear')} value={arrow(u.vsLastYear)} />
          )}
          {u.similar !== null && <WxKv label={t('usage.similar')} value={arrow(u.similar)} />}
        </WxRows>
      </>
    ),
    href: `/services/${u.serviceId}`,
  };
}

/** Heads-up: what has gone wrong or needs a decision. */
function noticesSpec(c: WidgetCtx): WxSpec | null {
  const { d, t, f } = c;
  const ns = d.notices;
  if (!ns.length) return null;
  const words = (n: HomeData['notices'][number]): { title: string; body: string; tag: string } => {
    switch (n.kind) {
      case 'price':
        return {
          title: t(n.toMinor > n.fromMinor ? 'notices.priceUpTitle' : 'notices.priceDownTitle', {
            service: n.serviceName,
          }),
          body: t('notices.priceBody', { from: f.money(n.fromMinor), to: f.money(n.toMinor) }),
          tag: f.money(n.toMinor),
        };
      case 'cancelled':
        return {
          title: t('notices.cancelledTitle', { service: n.serviceName }),
          body: t('notices.cancelledBody'),
          tag: '',
        };
      case 'unusual':
        return {
          title: t('notices.unusualTitle', { service: n.serviceName }),
          body:
            n.pct !== null
              ? t('notices.unusualBody', { pct: f.pct(n.pct) })
              : t('notices.unusualBodyPlain'),
          tag: n.pct !== null ? f.pct(n.pct) : '',
        };
      case 'plan':
        return {
          title: t('notices.planTitle', { service: n.serviceName }),
          body: t('notices.planBody'),
          tag: '',
        };
      case 'whose':
        return {
          title: t('notices.whoseTitle', { service: n.serviceName }),
          body: t('notices.whoseBody'),
          tag: '',
        };
      case 'inbox':
        return {
          title: t('notices.inboxTitle', { count: n.count }),
          body: t('notices.inboxBody'),
          tag: '',
        };
      case 'season':
        return {
          title: t('notices.seasonTitle', { service: n.serviceName }),
          body: t('notices.seasonBody', { pct: f.pct(n.pct) }),
          tag: f.pct(n.pct),
        };
    }
  };
  const first = words(ns[0]!);
  return {
    colour: 'var(--overdue)',
    instrument: { kind: 'plain', icon: 'bell', big: String(ns.length), small: t('wx.toLookAt') },
    cap: [first.title, t('notices.title')],
    title: t('notices.title'),
    facts: ns.slice(0, 3).map((n, i) => {
      const x = words(n);
      return { label: x.title, value: x.tag || String(i + 1) };
    }),
    body: (
      <WxRows>
        {ns.slice(0, 4).map((n, i) => {
          const x = words(n);
          return <WxRow key={i} title={x.title} sub={x.body} href={n.href} />;
        })}
      </WxRows>
    ),
    href: ns[0]!.href,
  };
}

/** The months ahead: what's due and what's expected. */
function forecastSpec(c: WidgetCtx): WxSpec | null {
  const { d, t, f } = c;
  const next = d.forecast[0];
  if (!next) return null;
  const now = d.month.projectedMinor;
  const change = now > 0 ? (next.totalMinor - now) / now : null;
  const hi = d.forecast.reduce((a, b) => (b.totalMinor > a.totalMinor ? b : a));
  const lo = d.forecast.reduce((a, b) => (b.totalMinor < a.totalMinor ? b : a));
  const about = (minor: number) => `≈ ${f.money(minor, true)}`;
  return {
    instrument: {
      kind: 'plain',
      icon: 'calendar',
      big: f.money(next.totalMinor, true),
      small: f.monthName(next.month),
      compact: true,
    },
    cap: [
      change === null ? about(next.totalMinor) : arrow(change),
      t('wx.onMonth', { month: f.monthName(d.month.month) }),
    ],
    title: t('forecast.title'),
    facts: d.forecast
      .slice(0, 3)
      .map((x) => ({ label: f.monthName(x.month), value: about(x.totalMinor) })),
    body: (
      <>
        <WxBars
          flat
          values={d.forecast.map((x) => x.totalMinor)}
          labels={d.forecast.map((x) => f.mon(x.month))}
        />
        <WxRows>
          <WxKv label={t('wx.highest')} value={`${f.mon(hi.month)} · ${about(hi.totalMinor)}`} />
          <WxKv label={t('wx.lowest')} value={`${f.mon(lo.month)} · ${about(lo.totalMinor)}`} />
          <WxKv
            label={t('wx.sixMonths')}
            value={about(d.forecast.reduce((a, b) => a + b.totalMinor, 0))}
          />
        </WxRows>
      </>
    ),
    href: '/services',
  };
}

/** What to put aside for next month's bills. */
function setAsideSpec(c: WidgetCtx): WxSpec | null {
  const { d, t, f } = c;
  const sa = d.setAside;
  if (!sa) return null;
  const mine = sa.each.find((x) => x.memberId === d.you.id)?.minor ?? 0;
  const total = sa.each.reduce((a, b) => a + b.minor, 0);
  const month = f.monthName(sa.month);
  const about = (minor: number) => `≈ ${f.money(minor, true)}`;
  const people = sa.each
    .map((x) => ({ m: d.members.find((y) => y.id === x.memberId), minor: x.minor }))
    .filter((x): x is { m: HomeData['members'][number]; minor: number } => !!x.m);
  return {
    instrument: {
      kind: 'plain',
      icon: 'money',
      big: f.money(mine, true),
      small: t('wx.forMonth', { month }),
      compact: true,
    },
    cap: [t('wx.yourShare'), t('wx.ofTotal', { amount: about(total) })],
    title: t('setaside.title', { month }),
    facts: people
      .slice(0, 3)
      .map((x) => ({ label: x.m.id === d.you.id ? t('you') : x.m.name, value: about(x.minor) })),
    body: (
      <WxRows>
        {people.slice(0, 4).map((x) => (
          <WxRow
            key={x.m.id}
            colour={colourCss(x.m.colour)}
            title={x.m.id === d.you.id ? t('you') : x.m.name}
            value={about(x.minor)}
          />
        ))}
        <WxKv label={t('wx.household', { month })} value={about(total)} />
      </WxRows>
    ),
    href: '/money',
  };
}

/** The viewer's own services, which only they see. */
function mineSpec(c: WidgetCtx): WxSpec | null {
  const { d, t, f } = c;
  if (!d.mine.length) return null;
  const total = d.mine.reduce((a, s) => a + s.thisMonthMinor, 0);
  const status = (s: HomeData['mine'][number]) =>
    s.latest
      ? t(`status.${s.latest.status.key}`, {
          n: Math.abs(s.latest.status.days),
          date: f.date(s.latest.status.dueDate),
        })
      : t('wx.noBills');
  return {
    instrument: {
      kind: 'plain',
      icon: 'user',
      big: f.money(total, true),
      small: t('wx.latestBills'),
      compact: true,
    },
    cap: [t('mine.title'), t('wx.onlyYou')],
    title: t('mine.title'),
    facts: d.mine.slice(0, 3).map((s) => ({ label: s.name, value: f.money(s.thisMonthMinor) })),
    body: (
      <WxRows>
        {d.mine.slice(0, 4).map((s) => (
          <WxRow
            key={s.id}
            colour={colourCss(s.colour)}
            title={s.name}
            sub={status(s)}
            value={f.money(s.thisMonthMinor)}
            href={`/services/${s.id}`}
          />
        ))}
      </WxRows>
    ),
    href: '/services',
  };
}

/** A bill being paid by instalments: how many are in. */
function planSpec(c: WidgetCtx): WxSpec | null {
  const { d, t, f } = c;
  const p = d.plan;
  if (!p) return null;
  const done = p.dots.filter((x) => x === 'done').length;
  const of = p.dots.length;
  const late = p.next.status.key === 'overdue';
  const svc =
    d.services.find((s) => s.name === p.serviceName) ??
    d.mine.find((s) => s.name === p.serviceName);
  return {
    colour: svc ? colourCss(svc.colour) : undefined,
    overdue: late,
    instrument: { kind: 'ring', value: done / of, big: `${done} / ${of}`, small: t('wx.paidLow') },
    cap: [f.money(p.next.amountMinor), p.serviceName],
    title: p.serviceName,
    figure: fig(c, p.next.amountMinor),
    facts: [
      {
        label: t('up.instalment', { n: p.next.n, of }),
        value: late ? t('wx.over', { n: -p.next.status.days }) : f.rel(p.next.dueDate),
        tone: late ? 'overdue' : undefined,
      },
      ...(p.yourMinor !== null ? [{ label: t('wx.yourShare'), value: f.money(p.yourMinor) }] : []),
    ],
    body: (
      <WxRows>
        {p.dots.slice(0, 4).map((dot, i) => (
          <WxRow
            key={i}
            colour={
              dot === 'later' ? 'var(--line-2)' : svc ? colourCss(svc.colour) : 'var(--p-accent)'
            }
            title={t('up.instalment', { n: i + 1, of })}
            value={
              dot === 'done' ? t('wx.paid') : dot === 'next' ? f.date(p.next.dueDate) : undefined
            }
          />
        ))}
      </WxRows>
    ),
    href: `/bills/${p.billId}`,
  };
}

/** Due dates: today, the week, five weeks. */
function calendarSpec(c: WidgetCtx): WxSpec | null {
  const { d, t, f } = c;
  if (!d.calendar.items.length) return null;
  const end = addDays(d.today, 7);
  const week = d.calendar.items.filter((x) => !x.paid && x.date >= d.today && x.date <= end);
  const items = d.calendar.items.map((x) => ({
    date: x.date,
    colour: colourCss(x.colour),
    paid: x.paid,
  }));
  const monday = addDays(d.calendar.start, 7);
  return {
    instrument: {
      kind: 'plain',
      icon: 'calendar',
      big: String(Number(d.today.slice(8, 10))),
      small: f.weekday(d.today),
    },
    cap: [t('wx.nDue', { n: week.length }), t('wx.thisWeekLow')],
    title: t('calendar.title'),
    figure: <WxCal start={monday} weeks={1} today={d.today} locale={d.locale} items={items} />,
    facts: [
      {
        label: t('wx.thisWeek'),
        value: t('calendar.due', {
          n: week.length,
          amount: f.money(
            week.reduce((a, b) => a + b.amountMinor, 0),
            true,
          ),
        }),
      },
    ],
    body: (
      <WxCal start={d.calendar.start} weeks={5} today={d.today} locale={d.locale} items={items} />
    ),
    href: '/bills',
  };
}

/** What happened lately. */
function activitySpec(c: WidgetCtx): WxSpec | null {
  const { d, t, f } = c;
  const ev = d.activity;
  if (!ev.length) return null;
  const who = (id: string | null, low = false) =>
    id === d.you.id ? t(low ? 'youLow' : 'you') : (d.members.find((m) => m.id === id)?.name ?? '');
  const line = (e: HomeData['activity'][number]) => {
    if (e.kind === 'document')
      return {
        text:
          e.state === 'waiting'
            ? t('activity.arrived', { title: e.title })
            : e.state === 'failed'
              ? t('activity.failed', { title: e.title })
              : e.needs
                ? e.title
                : t('activity.analysed', { title: e.title }),
        sub: e.needs
          ? t('inbox.toConfirm', { count: 1 })
          : t(`how.${e.how}`, { name: e.memberName ?? '' }),
        href: e.billId ? `/bills/${e.billId}` : `/inbox/${e.documentId}`,
        colour: 'var(--line-2)',
      };
    const mem = d.members.find((m) => m.id === (e.kind === 'share_paid' ? e.memberId : e.payerId));
    return {
      text:
        e.kind === 'share_paid'
          ? t('activity.sharePaid', {
              who: who(e.memberId),
              whom: who(e.payerId, true),
              amount: f.money(e.amountMinor),
            })
          : t('activity.billPaid', {
              who: who(e.payerId),
              service: e.serviceName,
              amount: f.money(e.amountMinor),
            }),
      sub: e.instalment
        ? t('activity.serviceInstalment', { service: e.serviceName, n: e.instalment })
        : e.serviceName,
      href: `/bills/${e.billId}`,
      colour: mem ? colourCss(mem.colour) : 'var(--line-2)',
    };
  };
  // When it happened: today, or its date (never the due-date wording).
  const when = (date: string) => (date === d.today ? t('rel.today') : f.date(date));
  const since = addDays(d.today, -7);
  const first = line(ev[0]!);
  return {
    instrument: {
      kind: 'plain',
      icon: 'list',
      big: String(ev.filter((e) => e.date >= since).length),
      small: t('wx.thisWeekLow'),
    },
    cap: [first.text, when(ev[0]!.date)],
    title: t('activity.title'),
    facts: ev.slice(0, 3).map((e) => ({ label: line(e).text, value: when(e.date) })),
    body: (
      <WxRows>
        {ev.slice(0, 4).map((e, i) => {
          const x = line(e);
          return (
            <WxRow
              key={i}
              colour={x.colour}
              title={x.text}
              sub={x.sub}
              value={when(e.date)}
              href={x.href}
            />
          );
        })}
      </WxRows>
    ),
  };
}

/** This week in the house: what's overdue, due soon and due later. */
function weekSpec(c: WidgetCtx): WxSpec {
  const { d, t, f } = c;
  const wk = d.week;
  const all = [...wk.overdue, ...wk.soon, ...wk.later];
  const total = all.reduce((a, b) => a + b.amountMinor, 0);
  const late = wk.overdue.length > 0;
  return {
    overdue: late,
    instrument: {
      kind: 'plain',
      icon: 'home',
      big: String(all.length),
      small: t('wx.dueThisWeek'),
    },
    cap: all.length ? [f.money(total), t('wx.toPayLow')] : [t('empty.week.title'), ''],
    title: t('week.title'),
    figure: all.length ? undefined : <WxNote>{t('week.quiet')}</WxNote>,
    facts: [
      ...(late
        ? [{ label: t('wx.overdue'), value: String(wk.overdue.length), tone: 'overdue' as const }]
        : []),
      ...(wk.soon.length
        ? [{ label: t('wx.dueSoon'), value: String(wk.soon.length), tone: 'warn' as const }]
        : []),
      ...(wk.later.length
        ? [{ label: t('wx.laterThisWeek'), value: String(wk.later.length) }]
        : []),
      ...(wk.debt
        ? [
            {
              label: t('wx.owes', { from: wk.debt.fromName, to: wk.debt.toName }),
              value: f.money(wk.debt.amountMinor),
            },
          ]
        : []),
    ].slice(0, 3),
    body: (
      <WxRows>
        {all.slice(0, 4).map((u, i) => (
          <WxRow
            key={i}
            colour={u.days < 0 ? 'var(--overdue)' : u.days <= 1 ? 'var(--warn)' : 'var(--line-2)'}
            title={
              u.instalment
                ? `${u.serviceName} · ${u.instalment.n} / ${u.instalment.of}`
                : u.serviceName
            }
            sub={u.days < 0 ? t('wx.over', { n: -u.days }) : f.rel(u.dueDate)}
            value={f.money(u.amountMinor)}
            note={u.share ? t('wx.yourShare') : undefined}
          />
        ))}
      </WxRows>
    ),
    href: '/bills',
  };
}

/** The season ahead: what it did to the bills last year. */
function seasonSpec(c: WidgetCtx): WxSpec | null {
  const { d, t, f } = c;
  const sn = d.season;
  if (!sn || !sn.rows.length) return null;
  const season = t(`season.names.${sn.season}`);
  const more = sn.monthlyMoreMinor;
  return {
    colour: 'var(--sc-yellow)',
    instrument: {
      kind: 'plain',
      icon: 'sun',
      big: `${more >= 0 ? '+' : '−'}${f.money(Math.abs(more), true)}`,
      small: t('wx.aMonthLow'),
      compact: true,
    },
    cap: [cap(season), t('season.inDays', { n: sn.daysUntil })],
    title: t('season.starts', { season: cap(season), date: f.date(sn.startMonth) }),
    facts: sn.rows.slice(0, 3).map((r) => ({ label: r.serviceName, value: f.pct(r.ratio - 1) })),
    body: (
      <WxRows>
        {sn.rows.slice(0, 3).map((r) => (
          <WxRow
            key={r.serviceId}
            colour={colourCss(r.colour)}
            title={r.serviceName}
            sub={t('wx.lastSeason', { season })}
            value={f.pct(r.ratio - 1)}
            href={`/services/${r.serviceId}`}
          />
        ))}
        <WxKv label={t('wx.starts')} value={t('season.inDays', { n: sn.daysUntil })} />
      </WxRows>
    ),
    href: `/services/${sn.rows[0]!.serviceId}`,
  };
}

/** A new household's first steps. */
function startSpec(c: WidgetCtx): WxSpec {
  const { d, t } = c;
  const steps: [boolean, string, string][] = [
    [d.start.household, t('start.household'), t('start.householdSub')],
    [d.start.firstBill, t('start.firstBill'), t('start.firstBillSubNoAddress')],
    [d.start.invited, t('start.invite'), t('start.inviteSub')],
    [
      d.start.postcode,
      t('start.postcode'),
      d.start.postcode ? t('start.postcodeDone') : t('start.postcodeSub'),
    ],
  ];
  const done = steps.filter((x) => x[0]).length;
  const next = steps.find((x) => !x[0]);
  const word = (ok: boolean, title: string) =>
    ok ? t('wx.done') : title === next?.[1] ? t('wx.next') : t('wx.toDo');
  return {
    instrument:
      done === steps.length
        ? { kind: 'ring', value: 1, icon: 'check' }
        : {
            kind: 'ring',
            value: done / steps.length,
            big: `${done} / ${steps.length}`,
            small: t('wx.doneLow'),
          },
    cap: [t('start.title'), next ? next[1] : t('wx.done')],
    title: t('start.title'),
    facts: steps.slice(0, 3).map(([ok, title]) => ({ label: title, value: word(ok, title) })),
    body: (
      <WxRows>
        {steps.map(([ok, title, sub]) => (
          <WxRow
            key={title}
            colour={ok ? 'var(--p-accent)' : 'var(--line-2)'}
            title={title}
            sub={sub}
            note={word(ok, title)}
          />
        ))}
      </WxRows>
    ),
    action: { icon: 'upload', label: t('actions.add'), href: '/bills/upload' },
  };
}

/** No postcode yet: what adding one turns on. */
function postcodeSpec(c: WidgetCtx): WxSpec {
  const { t } = c;
  const href = '/settings/location';
  return {
    colour: 'var(--sc-blue)',
    instrument: { kind: 'ring', value: 0, icon: 'pin', filled: true },
    cap: [t('postcode.add'), t('wx.forWeather')],
    title: t('weather.title'),
    figure: <WxFig main={t('wx.noPostcode')} />,
    facts: [
      { label: t('weather.title'), value: t('wx.localForecast') },
      { label: t('wx.seasons'), value: t('wx.costNotes') },
    ],
    body: (
      <WxRows>
        <WxKv label={t('wx.area')} value={t('wx.nearby')} />
        <WxKv label={t('wx.kept')} value={t('wx.onlyPostcode')} />
      </WxRows>
    ),
    action: { icon: 'plus', label: t('postcode.add'), href },
    href,
  };
}

/** Quick actions: all buttons, more of them as the widget grows. */
function actions(c: WidgetCtx): ReactNode {
  const { d, t } = c;
  const size = sizeOf(c);
  if (size === 's')
    return (
      <WxBig icon="plus" label={t('actions.add')} sub={t('wx.uploadOrHand')} href="/bills/upload" />
    );
  const acts = [
    { icon: 'upload', label: t('wx.uploadBill'), href: '/bills/upload' },
    { icon: 'pencil', label: t('start.byHand'), href: '/bills/new' },
    d.split
      ? { icon: 'check', label: t('actions.record'), href: '/money' }
      : { icon: 'mail', label: t('actions.address'), href: '/inbox' },
    ...(d.split
      ? [{ icon: 'mail', label: t('actions.address'), href: '/inbox' }]
      : [{ icon: 'services', label: t('services.title'), href: '/services' }]),
    { icon: 'users', label: t('wx.invite'), href: '/members' },
    { icon: 'download', label: t('wx.download'), href: '/bills' },
  ];
  return (
    <div className={`wx wx-${size}`}>
      <WxActs acts={acts.slice(0, size === 'm' ? 3 : 6)} />
    </div>
  );
}

/** A widget with nothing to show yet: what will appear, in its own words. */
export function emptySpec(icon: string, name: string, title: string, body: string): WxSpec {
  return {
    instrument: { kind: 'ring', value: 0, icon },
    cap: [title, name],
    title: name,
    figure: (
      <WxNote>
        <b>{title}.</b> {body}
      </WxNote>
    ),
  };
}

const def = (id: string, icon: string, spec: (c: WidgetCtx) => WxSpec | null): WidgetDef => ({
  id,
  icon,
  sizes: SIZE_LIST,
  render: (c) => card(c, spec(c)),
});

/** Every widget but the per-service ones, in the order the Add list shows them. */
export const WIDGETS: WidgetDef[] = [
  def('month', 'calendar', monthSpec),
  def('weather', 'cloud-sun', weatherSpec),
  def('nextdue', 'clock', nextDueSpec),
  def('owes', 'money', owesSpec),
  def('trend', 'chart', trendSpec),
  def('services', 'services', servicesSpec),
  def('usage', 'bolt', usageSpec),
  def('notices', 'bell', noticesSpec),
  def('inbox', 'inbox', inboxSpec),
  def('forecast', 'trend-up', forecastSpec),
  def('setaside', 'money', setAsideSpec),
  def('mine', 'user', mineSpec),
  def('plan', 'repeat', planSpec),
  def('calendar', 'calendar', calendarSpec),
  def('activity', 'list', activitySpec),
  def('week', 'home', weekSpec),
  { id: 'actions', icon: 'plus', sizes: SIZE_LIST, render: actions },
  def('season', 'sun', seasonSpec),
  def('start', 'check', startSpec),
  def('postcode', 'pin', postcodeSpec),
];

/** One widget per household service (its id is svc-<service id>). */
export const serviceWidget = (s: HomeData['services'][number]): WidgetDef =>
  def(`svc-${s.id}`, s.icon, (c) => serviceSpec(c, s));
