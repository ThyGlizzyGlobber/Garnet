import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { lowerFirst, relativeDay, rowCtx, statusLabel } from '@/components/app/bill-rows';
import { Card } from '@/components/ui';
import { Chip } from '@/components/ui/chip';
import { Disc } from '@/components/ui/colour';
import type { PageContext } from '@/lib/context';
import { daysBetween } from '@/lib/dates';
import { formatMonthRange } from '@/lib/format';
import { getMember } from '@/lib/members';
import { colourCss } from '@/lib/palette';
import { isLevel, periodDays, type ServiceRibbon, type ServicesView } from '@/lib/services-view';

/**
 * One service's ribbon: its name, the last twelve months' total, a block per
 * bill across the window, and the sentence its facts make. Shared by the
 * Services page and a main service's page (Subscriptions). Returns a
 * function that draws one.
 */
export async function ribbonRenderer(ctx: PageContext, window: ServicesView['window']) {
  const { hh, money, month } = ctx;
  const t = await getTranslations('services');
  const tu = await getTranslations('ui');
  const rc = rowCtx(ctx, tu);

  const sentence = (s: ServiceRibbon): string => {
    const parts: string[] = [];
    if (s.cancelled) {
      const by = s.cancelled.by ? getMember(hh.id, s.cancelled.by) : null;
      parts.push(
        by
          ? t('ribbon.cancelledBy', {
              date: rc.dateYear(s.cancelled.at.slice(0, 10)),
              name: by.id === ctx.me.id ? t('page.you') : by.name,
            })
          : t('ribbon.cancelled', { date: rc.dateYear(s.cancelled.at.slice(0, 10)) }),
      );
      if (s.afterCancel) parts.push(t('ribbon.afterCancel', { count: s.afterCancel }));
    } else if (s.instalment)
      parts.push(
        t('ribbon.instalments', {
          n: s.instalment.n,
          of: s.instalment.of,
          when: relativeDay(
            rc,
            daysBetween(ctx.today, s.instalment.dueDate),
            s.instalment.dueDate,
          ).toLowerCase(),
        }),
      );
    else if (s.vsLastYear !== null && !isLevel(s.vsLastYear))
      parts.push(
        t('ribbon.vsLastYear', {
          pct: Math.round(Math.abs(s.vsLastYear) * 100),
          dir: s.vsLastYear > 0 ? 'up' : 'down',
        }),
      );
    else if (s.vsLastYear !== null) parts.push(t('ribbon.levelLastYear'));
    else if (s.personal) parts.push(t('ribbon.yours'));
    else if (s.percentages) parts.push(t('ribbon.split', { parts: s.percentages.join(' / ') }));
    if (s.unusual) parts.push(t('ribbon.unusual'));
    if (s.nextDue && !s.instalment) parts.push(t('ribbon.next', { date: rc.dateYear(s.nextDue) }));
    if (s.latest)
      parts.push(
        t('ribbon.last', {
          amount: money(s.latest.amountMinor),
          status: lowerFirst(statusLabel(rc, s.latest.status)),
        }),
      );
    return parts.join(' ');
  };

  return function ribbon(s: ServiceRibbon, opts: { sub?: boolean; href?: string } = {}) {
    return (
      <Card
        key={s.id}
        className={`d3-svc${opts.sub ? ' d3-svc-sub' : ''}${s.cancelled ? ' is-cancelled' : ''}`}
        style={{ ['--svc' as string]: colourCss(s.colour) }}
      >
        <Link href={opts.href ?? `/services/${s.id}`} className="d3-svc-l">
          <Disc icon={s.icon} colour={s.colour} />
          <span>
            <b>{s.name}</b>
            <span className="muted">
              {s.cancelled ? (
                <Chip tone={s.afterCancel ? 'bad' : 'neutral'}>{t('cancelled')}</Chip>
              ) : s.provider !== s.name ? (
                s.provider
              ) : null}
            </span>
          </span>
        </Link>
        <div className="d3-svc-fig">
          <span className="fig fig-md">{money(s.yearMinor, hh.currency, { whole: true })}</span>
          <span className="muted small">{t('ribbon.year', { count: s.yearBills })}</span>
        </div>
        <div className="d3-rib">
          <div className="d3-rib-track">
            {s.blocks.map((b) => {
              const tip = `${formatMonthRange(b.periodStart, b.periodEnd, hh.locale)} · ${money(b.amountMinor)} · ${statusLabel(rc, b.status)}`;
              return (
                <Link
                  key={b.billId}
                  href={`/bills/${b.billId}`}
                  className={`rb s-${b.status.key === 'today' || b.status.key === 'tomorrow' ? 'soon' : b.status.key}${b.clipped ? ' clip' : ''}${b.unusual ? ' flag' : ''}`}
                  style={{ left: `calc(${b.left}% + 1px)`, width: `calc(${b.width}% - 2px)` }}
                  data-tip={tip}
                  aria-label={`${s.name} ${tip} · ${periodDays(b)} d`}
                >
                  <span>
                    {b.width > 12 ? money(b.amountMinor, hh.currency, { whole: true }) : ''}
                  </span>
                </Link>
              );
            })}
            <i className="today-line" style={{ left: `${window.today}%` }}>
              <span>{t('ribbon.today')}</span>
            </i>
          </div>
          <div className="d3-rib-axis" aria-hidden="true">
            {window.months.map((m, i) => (
              <span key={m.label} style={{ left: `${m.left}%` }}>
                {i % 3 === 0 ? month(m.label, 'short') : ''}
              </span>
            ))}
          </div>
        </div>
        <p className="d3-svc-sum">{sentence(s)}</p>
      </Card>
    );
  };
}
