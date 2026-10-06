import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Icon } from '@/components/app/icons';
import { rowCtx, statusLabel } from '@/components/app/bill-rows';
import { StackRing } from '@/components/app/stack-ring';
import { StatusChip, type Tone } from '@/components/ui/chip';
import { Disc } from '@/components/ui/colour';
import type { PageContext } from '@/lib/context';
import { formatMoneyParts } from '@/lib/format';
import { colourCss } from '@/lib/palette';
import type { Lens, ServiceTile, TileText } from '@/lib/services-view';
import { unitLabel } from '@/lib/units';

/**
 * A service on the Services page (SCOPE-services.md §3b, V-D10): the shape
 * of a Home Medium widget. The icon disc and name in the service's colour
 * (the provider under it only where it differs; a main service its count),
 * a status chip, the ring that says most about it, the figure, one line and
 * one fact; a bar a month on the year lenses. The whole tile opens the
 * service's page.
 */
export async function Tile({
  tile,
  lens,
  period,
  ctx,
}: {
  tile: ServiceTile;
  lens: Lens;
  /** The lens's period, named ("2026", "2026–27"), for the year lenses' line. */
  period: string;
  ctx: PageContext;
}) {
  const t = await getTranslations('services.tile');
  const tm = await getTranslations('main');
  const rc = rowCtx(ctx, await getTranslations('ui'));
  const { hh, money, month, pct, qty } = ctx;
  const whole = (minor: number) => money(minor, hh.currency, { whole: minor >= 100_000 });

  const chip = (() => {
    const c = tile.chip;
    if (c.kind === 'unusual') return { label: t('chip.unusual'), tone: 'bad' as const };
    if (c.kind === 'expected')
      return { label: t('chip.expected', { date: rc.date(c.dueDate) }), tone: 'info' as const };
    if (c.kind === 'none') return { label: t('chip.none'), tone: 'neutral' as const };
    const s = { key: c.kind, days: c.days, dueDate: c.dueDate, tone: 'neutral' as const };
    const tone: Tone =
      c.kind === 'paid'
        ? 'ok'
        : c.kind === 'overdue'
          ? 'bad'
          : c.kind === 'due'
            ? 'neutral'
            : 'warn';
    return { label: statusLabel(rc, { ...s, tone }), tone };
  })();

  const ring = (() => {
    const r = tile.ring;
    const centre = (big: string, small: string) => (
      <>
        <b>{big}</b>
        <small>{small}</small>
      </>
    );
    switch (r.kind) {
      case 'overdue':
        return {
          pct: 1,
          arc: false,
          cls: 'is-bad',
          in: centre(String(r.days), t('ring.daysOver')),
        };
      case 'usage': {
        const unit = unitLabel(r.unit);
        const short = `${qty(r.perDay)}${unit.length <= 2 ? unit : ''}`;
        return {
          pct: r.limitPerDay ? Math.min(1, r.perDay / r.limitPerDay) : 0,
          arc: true,
          cls: '',
          in: centre(short, unit.length > 2 ? `${unit} ${t('ring.aDay')}` : t('ring.aDay')),
        };
      }
      case 'instalments':
        return {
          pct: r.of ? r.paid / r.of : 0,
          arc: false,
          cls: '',
          in: centre(`${r.paid} / ${r.of}`, t('ring.instalments')),
        };
      case 'shares':
        return {
          pct: r.total ? r.paid / r.total : 0,
          arc: false,
          cls: '',
          in: centre(`${r.paid} / ${r.total}`, t('ring.sharesIn')),
        };
      case 'days':
        return {
          pct: 1 - Math.min(r.days, 30) / 30,
          arc: false,
          cls: '',
          in: centre(String(r.days), t('ring.daysLeft')),
        };
      case 'paid':
        return {
          pct: 1,
          arc: false,
          cls: 'is-ok',
          in: <Icon name="check" width={22} height={22} />,
        };
      case 'bills':
        return {
          pct: r.total ? r.paid / r.total : 0,
          arc: false,
          cls: '',
          in: centre(`${r.paid} / ${r.total}`, t('ring.paid')),
        };
      default:
        return {
          pct: 0,
          arc: false,
          cls: 'is-icon',
          in: <Icon name={tile.icon} width={24} height={24} />,
        };
    }
  })();

  /** A line or a fact, worded. */
  const text = (x: TileText, as: 'line' | 'fact'): { label?: string; value: string } | null => {
    switch (x.kind) {
      case 'samePrice':
        return {
          value: x.dueDate
            ? t('line.samePriceDue', { date: rc.date(x.dueDate) })
            : t('line.samePrice'),
        };
      case 'usageOfLimit':
        return { value: t('line.usageOfLimit', { pct: pct(x.pct) }) };
      case 'usage':
        return { value: t('line.usage', { qty: qty(x.perDay), unit: unitLabel(x.unit) }) };
      case 'vsLastYear':
        return as === 'fact'
          ? {
              label: t('fact.onLastYear'),
              value: pct(x.pct, { signed: true }).replace('+', '↑ ').replace('-', '↓ '),
            }
          : {
              value: t('line.vsLastYear', {
                pct: pct(x.pct, { signed: true }).replace('+', '↑ ').replace('-', '↓ '),
              }),
            };
      case 'unusual':
        return {
          value: t('line.unusual', {
            pct: pct(x.pct, { signed: true }).replace('+', '↑ ').replace('-', '↓ '),
          }),
        };
      case 'instalmentsLeft':
        return {
          value: t('line.instalmentsLeft', {
            left: money(x.leftMinor),
            total: whole(x.totalMinor),
          }),
        };
      case 'nextInstalment':
        return { label: t('fact.nextInstalment'), value: rc.dateYear(x.dueDate) };
      case 'nothing':
        return as === 'line' ? { value: t('line.nothing') } : null;
      case 'next':
        return as === 'fact'
          ? {
              label: t('fact.next'),
              value: `${x.name ? `${x.name} · ` : ''}${t('fact.about', { date: rc.dateYear(x.dueDate) })}`,
            }
          : {
              value: x.minor
                ? t('line.nextAmount', { date: rc.dateYear(x.dueDate), amount: whole(x.minor) })
                : t('line.next', { date: rc.dateYear(x.dueDate) }),
            };
      case 'yourShare':
        return {
          label: t('fact.yourShare'),
          value: `${money(x.minor)}${x.paid ? ` ${t('fact.paid')}` : ''}`,
        };
      case 'paid':
        return { label: t('fact.paidOn'), value: rc.dateYear(x.date) };
      case 'bills':
        return { value: t('line.bills', { period: period, count: x.count }) };
      case 'highest':
        return { label: t('fact.highest'), value: `${month(x.month, 'long')} · ${whole(x.minor)}` };
      case 'lastYear':
        return { label: t('fact.lastYear'), value: whole(x.minor) };
      case 'aMonth':
        return { label: t('fact.aMonth'), value: whole(x.minor) };
      case 'taxReceipt':
        return {
          label: t('fact.thisYear'),
          value: t('fact.taxReceipt', { amount: whole(x.minor) }),
        };
    }
  };
  const line = text(tile.line, 'line');
  const fact = text(tile.fact, 'fact');
  const fig =
    tile.figureMinor !== null ? formatMoneyParts(tile.figureMinor, hh.currency, hh.locale) : null;
  const under =
    tile.kind === 'group'
      ? tile.category === 'vehicle'
        ? t('vehicles', { count: tile.count ?? 0 })
        : t('count', { count: tile.count ?? 0 })
      : [tile.provider, tile.mine ? t('yours') : null].filter(Boolean).join(' · ');
  const name = tile.kind === 'group' && tile.category ? tm(`main.${tile.category}`) : tile.name;
  const max = tile.bars ? Math.max(1, ...tile.bars) : 1;

  return (
    <Link
      href={tile.href}
      className={`glass sv-tile rounded-card${tile.quiet ? ' is-quiet' : ''}`}
      style={{ ['--svc' as string]: colourCss(tile.colour) }}
    >
      <span className="sv-th">
        <Disc icon={tile.icon} colour={tile.colour} size="sm" />
        <span className="sv-tn">
          <b>{name}</b>
          {under && <span>{under}</span>}
        </span>
        <StatusChip status={chip} />
      </span>
      <span className="sv-tb">
        <StackRing
          pct={ring.pct}
          arc={ring.arc}
          label={chip.label}
          className={`st-ring sv-ring ${ring.cls}`}
        >
          {ring.in}
        </StackRing>
        <span className="sv-tx">
          {fig ? (
            <b className="sv-fig fig">
              {tile.approx && '≈ '}
              {fig.main}
              <small>{fig.minor}</small>
              {fig.tail}
            </b>
          ) : (
            <b className="sv-fig fig">—</b>
          )}
          {line && <span className="sv-line">{line.value}</span>}
          {fact && (
            <span className="sv-fact">
              {fact.label && <span>{fact.label}</span>}
              <b>{fact.value}</b>
            </span>
          )}
        </span>
        {tile.bars && lens !== 'month' && (
          <span className="sv-bars" aria-hidden="true">
            {tile.bars.map((m, i) => (
              <i
                key={i}
                className={m ? '' : 'empty'}
                style={m ? { height: `${Math.round((m / max) * 100)}%` } : undefined}
              />
            ))}
          </span>
        )}
      </span>
    </Link>
  );
}
