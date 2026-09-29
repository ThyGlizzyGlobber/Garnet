import { getTranslations } from 'next-intl/server';
import { ChangeText } from '@/components/app/usage';
import { Card } from '@/components/ui';
import { METRIC_KINDS } from '@/db/schema';
import type { BillDetail } from '@/lib/bills';
import { figureChanges } from '@/lib/consumption';
import type { PageContext } from '@/lib/context';
import { listBillMetrics } from '@/lib/metrics';
import { unitLabel } from '@/lib/units';

/** "From the bill": every figure the reader found, grouped by kind, with the change since last bill. */
export async function FiguresCard({ bill: b, ctx }: { bill: BillDetail; ctx: PageContext }) {
  const metrics = listBillMetrics(ctx.hh.id, b.id);
  if (!metrics.length) return null;
  const t = await getTranslations('bills');
  const tu = await getTranslations('usage');
  const { hh, money, date } = ctx;
  const changes = figureChanges(hh.id, b.id);
  const words = (pct: number) => ({
    more: tu('more', { pct }),
    less: tu('less', { pct }),
    same: tu('same'),
  });
  // Printed figures keep their precision (rates like 0.2953 a kWh).
  const number = new Intl.NumberFormat(hh.locale, { maximumFractionDigits: 4 });
  const figure = (m: (typeof metrics)[number]) =>
    m.amountMinor !== null
      ? money(m.amountMinor, m.currency ?? b.currency)
      : `${number.format(m.value ?? 0)}${m.unit ? ` ${unitLabel(m.unit)}` : ''}`;
  return (
    <Card className="mt-4">
      <h2 className="font-semibold">{t('metrics.title')}</h2>
      <p className="mt-0.5 text-xs text-fg-muted">{t('metrics.body')}</p>
      {METRIC_KINDS.filter((k) => metrics.some((m) => m.kind === k)).map((kind) => (
        <div key={kind} className="mt-4">
          <h3 className="text-xs font-semibold tracking-wide text-fg-muted uppercase">
            {t(`metrics.kind.${kind}`)}
          </h3>
          <dl className="mt-1 divide-y divide-border text-sm">
            {metrics
              .filter((m) => m.kind === kind)
              .map((m) => (
                <div key={m.id} className="flex items-baseline justify-between gap-4 py-1.5">
                  <dt className="min-w-0">
                    {m.label}
                    {m.periodStart && m.periodEnd && (
                      <span className="ml-1 text-xs text-fg-muted">
                        {date(m.periodStart, 'short')} – {date(m.periodEnd, 'short')}
                      </span>
                    )}
                  </dt>
                  <dd className="shrink-0 text-right tabular-nums">
                    <span className="font-medium">{figure(m)}</span>
                    <ChangeText
                      className="block text-xs"
                      change={changes.get(m.id)}
                      words={words}
                      neutral={m.kind === 'average' || (m.amountMinor ?? 0) < 0}
                    />
                  </dd>
                </div>
              ))}
          </dl>
        </div>
      ))}
    </Card>
  );
}
