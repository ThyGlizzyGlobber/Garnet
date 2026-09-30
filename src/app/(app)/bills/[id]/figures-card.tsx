import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui';
import { FigureRows, SectionHead, type FigureRowModel } from '@/components/ui/blocks';
import { METRIC_KINDS } from '@/db/schema';
import type { BillDetail } from '@/lib/bills';
import { figureChanges } from '@/lib/consumption';
import type { PageContext } from '@/lib/context';
import { listBillMetrics } from '@/lib/metrics';
import { unitLabel } from '@/lib/units';

/** "From the bill": every figure printed on it, by kind, with the change since the last bill. */
export async function FiguresCard({ bill: b, ctx }: { bill: BillDetail; ctx: PageContext }) {
  const metrics = listBillMetrics(ctx.hh.id, b.id);
  if (!metrics.length) return null;
  const t = await getTranslations('bills.metrics');
  const tu = await getTranslations('usage');
  const { hh, money, date, pct } = ctx;
  const changes = figureChanges(hh.id, b.id);
  // Printed figures keep their precision (rates like 0.2953 a kWh).
  const number = new Intl.NumberFormat(hh.locale, { maximumFractionDigits: 4 });
  const rows: FigureRowModel[] = [];
  for (const kind of METRIC_KINDS) {
    for (const m of metrics.filter((x) => x.kind === kind)) {
      const period =
        m.periodStart && m.periodEnd
          ? ` ${date(m.periodStart, 'short')} – ${date(m.periodEnd, 'short')}`
          : '';
      const change = changes.get(m.id);
      const comparison = m.kind === 'comparison';
      rows.push({
        label: m.label + (rows.some((r) => r.label === m.label) ? period : ''),
        value: comparison
          ? `${number.format(m.value ?? 0)}${m.unit ? ` ${unitLabel(m.unit)}` : ''}`
          : m.amountMinor !== null
            ? undefined
            : `${number.format(m.value ?? 0)}${m.unit ? ` ${unitLabel(m.unit)}` : ''}`,
        amount: m.amountMinor !== null ? money(m.amountMinor, m.currency ?? b.currency) : undefined,
        change: comparison
          ? null
          : change?.pct == null
            ? null
            : Math.abs(change.pct) < 0.005
              ? 0
              : change.pct,
        comparison,
      });
    }
  }
  return (
    <Card>
      <SectionHead title={t('title')} right={<span className="muted">{t('vsLast')}</span>} />
      <FigureRows rows={rows} same={tu('sameShort')} pct={(f) => pct(f, { signed: true })} />
    </Card>
  );
}
