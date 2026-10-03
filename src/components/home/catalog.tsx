import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon } from '@/components/app/icons';
import { CalendarGrid } from '@/components/charts/calendar-grid';
import { ForecastPills } from '@/components/charts/pills';
import { Sparkline } from '@/components/charts/sparkline';
import { TrendLine } from '@/components/charts/trend-line';
import { LinkButton } from '@/components/ui';
import { Kv, Money, Notice } from '@/components/ui/blocks';
import { StatusChip, type Tone } from '@/components/ui/chip';
import { Avatar, Disc } from '@/components/ui/colour';
import { Arc } from '@/components/ui/ring';
import { InstDots } from '@/components/ui/rows';
import { addDays } from '@/lib/dates';
import { colourCss } from '@/lib/palette';
import type { HomeData, Upcoming } from '@/lib/home-data';
import type { Fmt } from './fmt';
import { CORE_WIDGETS, serviceWidget } from './widgets';

/**
 * The widget catalogue (SCOPE-redesign.md R4): each widget's block sizes and
 * how it draws at each. Every widget takes the same plain data and grows in
 * detail with its block; the CSS in src/styles/home.css lays them out.
 */
type T = (key: string, values?: Record<string, string | number | Date>) => string;

export interface WidgetCtx {
  d: HomeData;
  w: number;
  h: number;
  cols: number;
  t: T;
  f: Fmt;
  /** Marks the viewer's share paid (Next due). */
  onMarkPaid?: (shareId: string, billId: string) => void;
}

export interface WidgetDef {
  id: string;
  icon: string;
  sizes: [number, number][];
  render: (c: WidgetCtx) => ReactNode;
}

const Hdr = ({ icon, title, right }: { icon: string; title: string; right?: ReactNode }) => (
  <header className="wg-h">
    <Icon name={icon} width={15} height={15} />
    <span className="wg-t">{title}</span>
    {right && <span className="wg-hr">{right}</span>}
  </header>
);

const Fig = ({ c, minor, small }: { c: WidgetCtx; minor: number; small?: boolean }) => (
  <Money
    minor={minor}
    currency={c.d.currency}
    locale={c.d.locale}
    className={small ? 'wg-fig sm' : 'wg-fig'}
  />
);

const member = (d: HomeData, id: string | null) => d.members.find((m) => m.id === id) ?? null;
const statusLabel = (c: WidgetCtx, s: Upcoming['status']) =>
  c.t(`status.${s.key}`, { n: Math.abs(s.days), date: c.f.date(s.dueDate) });

const CATALOG: WidgetDef[] = [
  ...CORE_WIDGETS,
  {
    id: 'trend',
    icon: 'chart',
    sizes: [
      [2, 1],
      [3, 1],
      [4, 1],
      [2, 2],
      [3, 2],
      [4, 2],
      [5, 2],
    ],
    render(c) {
      const { d, w, h, t, f } = c;
      const rows = d.monthly;
      if (rows.length < 2) return null;
      const avg = rows.reduce((a, r) => a + r.totalMinor, 0) / rows.length;
      return (
        <div className={h > 1 ? 'tr tr-l' : 'tr'}>
          <Hdr
            icon="chart"
            title={t('trend.title')}
            right={<span className="muted">{t('trend.avg', { amount: f.money(avg, true) })}</span>}
          />
          <TrendLine
            label={t('trend.label')}
            axis={w >= 3 || h > 1}
            every={w >= 4 ? 1 : w >= 3 ? 2 : 3}
            axisFormat={(v) => f.money(v * 100, true)}
            points={rows.map((r) => ({
              key: r.month,
              label: f.mon(r.month),
              value: r.totalMinor / 100,
              text: f.money(r.totalMinor, true),
            }))}
          />
        </div>
      );
    },
  },
  {
    id: 'services',
    icon: 'services',
    sizes: [
      [2, 1],
      [3, 1],
      [2, 2],
      [3, 2],
      [4, 2],
    ],
    render(c) {
      const { d, w, h, t, f } = c;
      const list = d.services;
      if (!list.length) return null;
      const n = h === 1 ? (w >= 3 ? 6 : 4) : 6;
      return (
        <div
          className={`sv sv-${h > 1 ? 'l' : 'm'}`}
          style={{ ['--n' as string]: h > 1 ? (w >= 3 ? 3 : 2) : Math.min(n, w * 2) }}
        >
          <Hdr
            icon="services"
            title={t('services.title')}
            right={<span className="muted">{t('services.thisMonth')}</span>}
          />
          <div className="sv-grid">
            {list.slice(0, n).map((s) => (
              <Link
                key={s.id}
                href={`/services/${s.id}`}
                className="sv-t"
                style={{ ['--svc' as string]: colourCss(s.colour) }}
              >
                <Disc icon={s.icon} colour={s.colour} size={h > 1 ? 'md' : 'sm'} />
                <span className="sv-n">{s.name}</span>
                <b>{f.money(s.thisMonthMinor, true)}</b>
                {h > 1 && <Sparkline values={s.spark} colour={s.colour} />}
              </Link>
            ))}
          </div>
        </div>
      );
    },
  },
  {
    id: 'usage',
    icon: 'bolt',
    sizes: [
      [1, 1],
      [2, 1],
      [2, 2],
    ],
    render(c) {
      const { d, w, h, t, f } = c;
      const u = d.usage;
      if (!u) return null;
      const top = u.limitPerDay ? u.limitPerDay * 1.25 : u.perDay * 1.25;
      const under = u.limitPerDay ? 1 - u.perDay / u.limitPerDay : null;
      return (
        <Link href={`/services/${u.serviceId}`} className={w > 1 ? 'us us-m' : 'us'}>
          <Hdr icon={u.icon} title={u.serviceName} />
          <div className="us-body">
            <div className="us-arc">
              <Arc
                pct={(u.perDay / top) * 100}
                from={u.colour}
                mark={u.limitPerDay ? (1 / 1.25) * 100 : undefined}
              >
                <b>{f.num(u.perDay)}</b>
                <span>{t('usage.perDay', { unit: u.unit })}</span>
              </Arc>
              {under !== null && (
                <span className="muted small">
                  {t(under >= 0 ? 'usage.under' : 'usage.over', {
                    pct: Math.round(Math.abs(under) * 100),
                  })}
                </span>
              )}
            </div>
            {w > 1 && (
              <div className="us-side">
                <Kv
                  rows={[
                    u.limitPerDay
                      ? [t('usage.yourLimit'), `${f.num(u.limitPerDay)} ${u.unit}`]
                      : null,
                    u.vsLastYear !== null
                      ? [
                          t('usage.lastYear'),
                          <span key="ly" className={`delta ${u.vsLastYear > 0 ? 'up' : 'down'}`}>
                            {f.pct(u.vsLastYear)}
                          </span>,
                        ]
                      : null,
                    u.similar !== null
                      ? [
                          t('usage.similar'),
                          <span key="sim" className={`delta ${u.similar > 0 ? 'up' : 'down'}`}>
                            {f.pct(u.similar)}
                          </span>,
                        ]
                      : null,
                  ]}
                />
                {h > 1 && u.spark.length > 1 && (
                  <div className="us-spark">
                    <Sparkline values={u.spark} colour={u.colour} />
                  </div>
                )}
              </div>
            )}
          </div>
        </Link>
      );
    },
  },
  {
    id: 'notices',
    icon: 'bell',
    sizes: [
      [1, 1],
      [2, 1],
      [2, 2],
      [3, 1],
    ],
    render(c) {
      const { d, w, h, t, f } = c;
      const ns = d.notices;
      if (!ns.length) return null;
      const words = (
        n: HomeData['notices'][number],
      ): { tone: Tone; icon: string; title: string; body: string } => {
        switch (n.kind) {
          case 'price':
            return {
              tone: 'warn',
              icon: n.toMinor > n.fromMinor ? 'trend-up' : 'trend-down',
              title: t(
                n.toMinor > n.fromMinor ? 'notices.priceUpTitle' : 'notices.priceDownTitle',
                {
                  service: n.serviceName,
                },
              ),
              body: t('notices.priceBody', { from: f.money(n.fromMinor), to: f.money(n.toMinor) }),
            };
          case 'cancelled':
            return {
              tone: 'bad',
              icon: 'alert',
              title: t('notices.cancelledTitle', { service: n.serviceName }),
              body: t('notices.cancelledBody'),
            };
          case 'unusual':
            return {
              tone: 'warn',
              icon: 'trend-up',
              title: t('notices.unusualTitle', { service: n.serviceName }),
              body:
                n.pct !== null
                  ? t('notices.unusualBody', { pct: f.pct(n.pct) })
                  : t('notices.unusualBodyPlain'),
            };
          case 'plan':
            return {
              tone: 'info',
              icon: 'repeat',
              title: t('notices.planTitle', { service: n.serviceName }),
              body: t('notices.planBody'),
            };
          case 'whose':
            return {
              tone: 'info',
              icon: 'users',
              title: t('notices.whoseTitle', { service: n.serviceName }),
              body: t('notices.whoseBody'),
            };
          case 'inbox':
            return {
              tone: 'warn',
              icon: 'inbox',
              title: t('notices.inboxTitle', { count: n.count }),
              body: t('notices.inboxBody'),
            };
          case 'season':
            return {
              tone: 'neutral',
              icon: 'sun',
              title: t('notices.seasonTitle', { service: n.serviceName }),
              body: t('notices.seasonBody', { pct: f.pct(n.pct) }),
            };
        }
      };
      if (w === 1) {
        const n = ns[0]!;
        const x = words(n);
        return (
          <Link href={n.href} className={`nt nt-s t-${x.tone}`}>
            <Hdr
              icon="bell"
              title={t('notices.title')}
              right={<i className="badge">{ns.length}</i>}
            />
            <span className="nt-ic">
              <Icon name={x.icon} width={22} height={22} />
            </span>
            <b>{x.title}</b>
            <span className="muted small">{x.body}</span>
          </Link>
        );
      }
      const k = h === 1 ? 2 : 3;
      return (
        <div className="nt">
          <Hdr
            icon="bell"
            title={t('notices.title')}
            right={<span className="muted">{t('notices.count', { count: ns.length })}</span>}
          />
          <div className={h === 1 && w >= 3 ? 'nt-list row' : 'nt-list'}>
            {ns.slice(0, k).map((n, i) => {
              const x = words(n);
              return (
                <Notice
                  key={i}
                  compact
                  tone={x.tone}
                  icon={x.icon}
                  title={x.title}
                  body={x.body}
                  href={n.href}
                />
              );
            })}
          </div>
        </div>
      );
    },
  },
  {
    id: 'forecast',
    icon: 'trend-up',
    sizes: [
      [2, 1],
      [3, 1],
      [4, 1],
      [2, 2],
    ],
    render(c) {
      const { d, w, t, f } = c;
      if (!d.forecast.length) return null;
      return (
        <div className="fc">
          <Hdr
            icon="trend-up"
            title={t('forecast.title')}
            right={<span className="muted">{t('forecast.estimates')}</span>}
          />
          <ForecastPills
            showAll={w >= 3}
            items={d.forecast.map((x) => ({
              label: f.mon(x.month),
              value: x.totalMinor,
              short: f.money(x.totalMinor, true),
              tip: t('forecast.tip', {
                month: f.monthName(x.month),
                amount: f.money(x.totalMinor, true),
              }),
            }))}
          />
        </div>
      );
    },
  },
  {
    id: 'setaside',
    icon: 'lock',
    sizes: [
      [1, 1],
      [2, 1],
    ],
    render(c) {
      const { d, w, t, f } = c;
      const sa = d.setAside;
      if (!sa) return null;
      const mine = sa.each.find((e) => e.memberId === d.you.id);
      const month = f.monthName(sa.month);
      if (w === 1)
        return (
          <div className="sa sa-s">
            <Hdr icon="lock" title={t('setaside.short')} />
            <Fig c={c} minor={mine?.minor ?? 0} small />
            <span className="muted small">{t('setaside.caption', { month })}</span>
          </div>
        );
      return (
        <div className="sa">
          <Hdr icon="lock" title={t('setaside.title', { month })} />
          <div className="sa-list">
            {sa.each.map((e) => {
              const mem = member(d, e.memberId);
              return mem ? (
                <div key={e.memberId} className="sa-r">
                  <Avatar name={mem.name} colour={mem.colour} size="sm" />
                  <span>{mem.id === d.you.id ? t('you') : mem.name}</span>
                  <b>{f.money(e.minor, true)}</b>
                </div>
              ) : null;
            })}
          </div>
        </div>
      );
    },
  },
  {
    id: 'mine',
    icon: 'user',
    sizes: [
      [1, 1],
      [2, 1],
    ],
    render(c) {
      const { d, w, t } = c;
      const s = d.mine.find((x) => x.latest) ?? d.mine[0];
      if (!s) return null;
      return (
        <Link
          href={s.latest ? `/bills/${s.latest.billId}` : `/services/${s.id}`}
          className={w > 1 ? 'mn mn-m' : 'mn'}
        >
          <Hdr icon="user" title={t('mine.title')} />
          <div className="mn-body">
            <Disc icon={s.icon} colour={s.colour} />
            <div className="mn-t">
              <b>{s.name}</b>
              <span className="muted">{s.provider}</span>
            </div>
            {s.latest && <Fig c={c} minor={s.latest.amountMinor} small />}
            {s.latest && (
              <StatusChip
                status={{ label: statusLabel(c, s.latest.status), tone: s.latest.status.tone }}
              />
            )}
          </div>
        </Link>
      );
    },
  },
  {
    id: 'plan',
    icon: 'landmark',
    sizes: [
      [1, 1],
      [2, 1],
    ],
    render(c) {
      const { d, w, t, f } = c;
      const p = d.plan;
      if (!p) return null;
      return (
        <Link href={`/bills/${p.billId}`} className={w > 1 ? 'pl pl-m' : 'pl'}>
          <Hdr icon="landmark" title={p.serviceName} />
          <div className="pl-body">
            <div>
              <div className="pl-fig">
                <Fig c={c} minor={p.next.amountMinor} small />
              </div>
              <span className="muted small">
                {t('up.instalment', { n: p.next.n, of: p.next.of })} · {f.rel(p.next.dueDate)}
              </span>
            </div>
            <InstDots states={p.dots} label={t('up.instalments')} />
            {w > 1 && p.yourMinor !== null && (
              <span className="pl-you">{t('plan.yourPart', { amount: f.money(p.yourMinor) })}</span>
            )}
          </div>
        </Link>
      );
    },
  },
  {
    id: 'calendar',
    icon: 'calendar',
    sizes: [
      [1, 1],
      [2, 1],
      [2, 2],
      [3, 2],
    ],
    render(c) {
      const { d, w, h, t, f } = c;
      const items = d.calendar.items;
      const ahead = items.filter((x) => !x.paid && x.date >= d.today);
      const next = ahead[0];
      if (w === 1 && h === 1) {
        if (!next) return null;
        const same = ahead.filter((x) => x.date === next.date);
        return (
          <Link href={`/bills/${next.billId}`} className="cal cal-s">
            <Hdr icon="calendar" title={t('nextdue.title')} />
            <div className="cal-leaf">
              <span className="cal-mon">{f.mon(next.date)}</span>
              <b>{Number(next.date.slice(8))}</b>
              <span className="cal-dow">{f.weekday(next.date)}</span>
            </div>
            <span className="cal-cap">
              {t('calendar.due', {
                n: same.length,
                amount: f.money(
                  same.reduce((s, x) => s + x.amountMinor, 0),
                  true,
                ),
              })}
            </span>
          </Link>
        );
      }
      const byDay = new Map<string, typeof items>();
      for (const x of items) byDay.set(x.date, [...(byDay.get(x.date) ?? []), x]);
      const day = (date: string) => {
        const its = byDay.get(date) ?? [];
        const dd = Number(date.slice(8));
        return {
          date,
          label: dd === 1 ? f.mon(date) : String(dd),
          today: date === d.today,
          past: date < d.today,
          done: its.length > 0 && its.every((x) => x.paid),
          dots: its.map((x) => x.colour),
          href: its[0] ? `/bills/${its[0].billId}` : undefined,
          title: its.length
            ? `${f.date(date)}: ${its.map((x) => `${x.serviceName} ${f.money(x.amountMinor)}${x.paid ? ` (${t('status.paid')})` : ''}`).join(', ')}`
            : undefined,
        };
      };
      const weekdays = Array.from({ length: 7 }, (_, i) =>
        f.weekday(addDays(d.calendar.start, i)).slice(0, 1),
      );
      if (h === 1) {
        const dow = (new Date(`${d.today}T00:00:00Z`).getUTCDay() + 6) % 7;
        const s2 = addDays(d.today, -dow);
        return (
          <div className="cal cal-m">
            <Hdr
              icon="calendar"
              title={t('calendar.title')}
              right={<span className="muted">{t('calendar.twoWeeks')}</span>}
            />
            <CalendarGrid
              weekdays={weekdays}
              days={Array.from({ length: 14 }, (_, i) => day(addDays(s2, i)))}
            />
          </div>
        );
      }
      const list = ahead.slice(0, w >= 3 ? 5 : 3);
      return (
        <div className={w >= 3 ? 'cal cal-l wide' : 'cal cal-l'}>
          <Hdr
            icon="calendar"
            title={t('calendar.title')}
            right={
              <span className="muted">
                {f.date(d.calendar.start)} – {f.date(addDays(d.calendar.start, 34))}
              </span>
            }
          />
          <div className="cal-body">
            <CalendarGrid
              weekdays={weekdays}
              days={Array.from({ length: 35 }, (_, i) => day(addDays(d.calendar.start, i)))}
            />
            <div className="cal-list">
              {list.map((x) => (
                <Link key={`${x.billId}:${x.date}`} href={`/bills/${x.billId}`} className="cal-li">
                  <i style={{ ['--c' as string]: colourCss(x.colour) }} />
                  <span>
                    {x.serviceName}
                    {x.instalment
                      ? ` · ${t('up.nOf', { n: x.instalment.n, of: x.instalment.of })}`
                      : ''}
                  </span>
                  <b>{f.rel(x.date)}</b>
                </Link>
              ))}
            </div>
          </div>
        </div>
      );
    },
  },
  {
    id: 'activity',
    icon: 'list',
    sizes: [
      [2, 1],
      [2, 2],
      [3, 2],
      [2, 3],
    ],
    render(c) {
      const { d, h, t, f } = c;
      const ev = d.activity.slice(0, h === 1 ? 2 : h === 2 ? 5 : 8);
      if (!ev.length) return null;
      const you = (id: string | null) => (id === d.you.id ? t('you') : (member(d, id)?.name ?? ''));
      const youLow = (id: string | null) =>
        id === d.you.id ? t('youLow') : (member(d, id)?.name ?? '');
      return (
        <div className="act">
          <Hdr icon="list" title={t('activity.title')} />
          <div className="act-list">
            {ev.map((e, i) => {
              let lead: ReactNode;
              let text: string;
              let sub: string;
              let href: string;
              if (e.kind === 'document') {
                lead = (
                  <span className="doc-ic sm">
                    <Icon
                      name={e.type === 'email' ? 'mail' : e.type === 'photo' ? 'photo' : 'file'}
                      width={15}
                      height={15}
                    />
                  </span>
                );
                text =
                  e.state === 'waiting'
                    ? t('activity.arrived', { title: e.title })
                    : e.state === 'failed'
                      ? t('activity.failed', { title: e.title })
                      : e.needs
                        ? e.title
                        : t('activity.analysed', { title: e.title });
                sub =
                  e.state === 'waiting'
                    ? t('inbox.waiting')
                    : e.needs
                      ? t('inbox.toConfirm', { count: 1 })
                      : t(`how.${e.how}`, { name: e.memberName ?? '' });
                href = e.billId ? `/bills/${e.billId}` : `/inbox/${e.documentId}`;
              } else if (e.kind === 'share_paid') {
                const mem = member(d, e.memberId);
                lead = mem ? (
                  <Avatar name={mem.name} colour={mem.colour} size="sm" />
                ) : (
                  <span className="doc-ic sm" />
                );
                text = t('activity.sharePaid', {
                  who: you(e.memberId),
                  whom: youLow(e.payerId),
                  amount: f.money(e.amountMinor),
                });
                sub = e.instalment
                  ? t('activity.serviceInstalment', { service: e.serviceName, n: e.instalment })
                  : e.serviceName;
                href = `/bills/${e.billId}`;
              } else {
                const mem = member(d, e.payerId);
                lead = mem ? (
                  <Avatar name={mem.name} colour={mem.colour} size="sm" />
                ) : (
                  <span className="doc-ic sm" />
                );
                text = t('activity.billPaid', {
                  who: you(e.payerId),
                  service: e.serviceName,
                  amount: f.money(e.amountMinor),
                });
                sub = e.instalment
                  ? t('activity.serviceInstalment', { service: e.serviceName, n: e.instalment })
                  : t('activity.bill', { service: e.serviceName });
                href = `/bills/${e.billId}`;
              }
              return (
                <Link key={i} href={href} className="act-row">
                  {lead}
                  <span className="act-main">
                    <b>{text}</b>
                    <span className="muted">{sub}</span>
                  </span>
                  <span className="act-when">{f.rel(e.date)}</span>
                </Link>
              );
            })}
          </div>
        </div>
      );
    },
  },
  {
    id: 'week',
    icon: 'home',
    sizes: [
      [2, 1],
      [3, 1],
      [2, 2],
      [3, 2],
    ],
    render(c) {
      const { d, w, h, t, f } = c;
      const wk = d.week;
      const list = new Intl.ListFormat(d.locale, { type: 'conjunction' });
      const name = (u: (typeof wk.soon)[number]) =>
        u.share
          ? t('week.share', {
              amount: f.money(u.amountMinor),
              service: u.serviceName.toLowerCase(),
            })
          : u.instalment
            ? t('week.instalment', { n: u.instalment.n, service: u.serviceName.toLowerCase() })
            : t('week.bill', {
                service: u.serviceName.toLowerCase(),
                amount: f.money(u.amountMinor, true),
              });
      const s: string[] = [];
      if (wk.overdue.length) {
        const names = list.format(wk.overdue.map(name));
        s.push(
          t('week.overdue', {
            items: names.charAt(0).toUpperCase() + names.slice(1),
            count: wk.overdue.length,
          }),
        );
      }
      if (wk.soon.length) {
        const names = list.format(wk.soon.map(name));
        s.push(
          t('week.soon', {
            items: names.charAt(0).toUpperCase() + names.slice(1),
            count: wk.soon.length,
            when: wk.soon[0]!.days === 0 ? t('week.today') : t('week.tomorrow'),
          }),
        );
      }
      if (wk.later.length)
        s.push(
          t('week.later', {
            items: list.format(
              wk.later.map((u) =>
                t('week.onDay', {
                  service: u.serviceName.toLowerCase(),
                  day: f.weekday(u.dueDate),
                }),
              ),
            ),
          }),
        );
      if (wk.debt)
        s.push(
          t('week.debt', {
            from: wk.debt.fromName,
            to: wk.debt.toName,
            amount: f.money(wk.debt.amountMinor),
            service: wk.debt.serviceName.toLowerCase(),
          }),
        );
      if (wk.cold) s.push(t('week.cold', { n: wk.cold }));
      else if (wk.hot) s.push(t('week.hot', { n: wk.hot }));
      if (!s.length) s.push(t('week.quiet'));
      const n = h > 1 || w >= 3 ? s.length : 3;
      return (
        <div className="wk">
          <Hdr icon="home" title={t('week.title')} />
          <p className="wk-p">
            {s.slice(0, n).map((x, i) => (
              <span key={i} className="wk-s">
                {x}{' '}
              </span>
            ))}
          </p>
        </div>
      );
    },
  },
  {
    id: 'actions',
    icon: 'plus',
    sizes: [
      [1, 1],
      [2, 1],
    ],
    render(c) {
      const { d, w, t } = c;
      const acts: [string, string, string][] = [
        ['plus', t('actions.add'), '/bills/new'],
        ['upload', t('actions.upload'), '/bills/upload'],
        ['copy', t('actions.address'), '/inbox'],
        ...(d.split ? [['money', t('actions.record'), '/money'] as [string, string, string]] : []),
      ];
      return (
        <div className={w > 1 ? 'qa qa-m' : 'qa'}>
          <Hdr icon="plus" title={t('actions.title')} />
          <div className="qa-grid">
            {acts.map(([ic, l, href]) => (
              <Link key={ic} href={href} className="qa-b" title={l} aria-label={l}>
                <Icon name={ic} width={18} height={18} />
                <span>{l}</span>
              </Link>
            ))}
          </div>
        </div>
      );
    },
  },
  {
    id: 'season',
    icon: 'sun',
    sizes: [
      [1, 1],
      [2, 1],
      [2, 2],
    ],
    render(c) {
      const { d, w, t, f } = c;
      const sn = d.season;
      if (!sn || !sn.rows.length) return null;
      const season = t(`season.names.${sn.season}`);
      const first = sn.rows[0]!;
      if (w === 1)
        return (
          <Link href={`/services/${first.serviceId}`} className="sn sn-s">
            <Hdr icon="sun" title={t('season.title')} />
            <div className="sn-fig">
              <b>{sn.daysUntil}</b>
              <span>{t('season.daysTo', { season })}</span>
            </div>
            <span className="sn-cap">
              {t('season.ranHigher', {
                service: first.serviceName,
                pct: f.pct(first.ratio - 1),
                season,
              })}
            </span>
          </Link>
        );
      const max = Math.max(...sn.rows.map((r) => Math.max(1, r.ratio))) * 1.1;
      return (
        <Link href={`/services/${first.serviceId}`} className="sn sn-m">
          <Hdr
            icon="sun"
            title={t('season.starts', { season, date: f.date(sn.startMonth) })}
            right={<span className="muted">{t('season.inDays', { n: sn.daysUntil })}</span>}
          />
          <div className="sn-rows">
            {sn.rows.map((r) => (
              <div key={r.serviceId} className="sn-r">
                <span className="sn-n">
                  <Disc icon={r.icon} colour={r.colour} size="sm" />
                  <span>{r.serviceName}</span>
                </span>
                <span className="sn-bars">
                  <i className="spring" style={{ width: `${(1 / max) * 100}%` }} />
                  <i
                    style={{
                      width: `${(r.ratio / max) * 100}%`,
                      ['--c' as string]: colourCss(r.colour),
                    }}
                  />
                </span>
                <b className={`delta ${r.ratio >= 1 ? 'up' : 'down'}`}>{f.pct(r.ratio - 1)}</b>
              </div>
            ))}
          </div>
          <span className="muted small">
            {sn.monthlyMoreMinor >= 0
              ? t('season.moreAMonth', { amount: f.money(Math.abs(sn.monthlyMoreMinor), true) })
              : t('season.lessAMonth', { amount: f.money(Math.abs(sn.monthlyMoreMinor), true) })}
          </span>
        </Link>
      );
    },
  },
  {
    id: 'start',
    icon: 'check',
    sizes: [
      [3, 2],
      [2, 2],
      [2, 3],
      [4, 2],
    ],
    render(c) {
      const { d, w, t } = c;
      const steps: [boolean, string, string][] = [
        [d.start.household, t('start.household'), t('start.householdSub')],
        [
          d.start.firstBill,
          t('start.firstBill'),
          d.address
            ? t('start.firstBillSub', { address: d.address })
            : t('start.firstBillSubNoAddress'),
        ],
        [d.start.invited, t('start.invite'), t('start.inviteSub')],
        [
          d.start.postcode,
          t('start.postcode'),
          d.start.postcode ? t('start.postcodeDone') : t('start.postcodeSub'),
        ],
      ];
      const done = steps.filter((x) => x[0]).length;
      return (
        <div className="gs">
          <Hdr
            icon="check"
            title={t('start.title')}
            right={<span className="muted">{t('start.done', { done, of: steps.length })}</span>}
          />
          <ol className="gs-list">
            {steps.map(([ok, title, sub]) => (
              <li key={title} className={ok ? 'done' : undefined}>
                <i className="gs-dot">{ok && <Icon name="check" width={12} height={12} />}</i>
                <span>
                  <b>{title}</b>
                  <span className="muted small">{sub}</span>
                </span>
              </li>
            ))}
          </ol>
          <div className="gs-acts">
            <LinkButton href="/inbox" size="sm" icon="copy">
              {t('start.copyAddress')}
            </LinkButton>
            <LinkButton href="/bills/upload" variant="secondary" size="sm" icon="upload">
              {t('actions.upload')}
            </LinkButton>
            {w >= 3 && (
              <LinkButton href="/bills/new" variant="ghost" size="sm">
                {t('start.byHand')}
              </LinkButton>
            )}
          </div>
        </div>
      );
    },
  },
  {
    id: 'postcode',
    icon: 'pin',
    sizes: [
      [1, 1],
      [2, 1],
    ],
    render(c) {
      const { w, t } = c;
      return (
        <div className={w > 1 ? 'pc pc-m' : 'pc'}>
          <Hdr icon="pin" title={t('weather.title')} />
          <p className="pc-t">{t('postcode.body')}</p>
          <LinkButton href="/settings/location" variant="secondary" size="sm" icon="pin">
            {t('postcode.add')}
          </LinkButton>
        </div>
      );
    },
  },
];

/** The whole catalogue for a household: the twenty plus one per service. */
export function catalogFor(d: HomeData): WidgetDef[] {
  return [...CATALOG, ...d.services.map(serviceWidget)];
}

/** Widgets that still say something before the first bill. */
export const ALWAYS = new Set(['weather', 'start', 'actions', 'postcode']);
