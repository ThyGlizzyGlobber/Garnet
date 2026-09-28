import { and, asc, eq, isNotNull, isNull } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { bill, billMetric, METRIC_KINDS, type BillMetric } from '@/db/schema';
import type { ExtractedMetric } from '@/ingest/extractors/types';
import { ulid } from '@/lib/ids';
import { listUnits } from '@/lib/units';

/**
 * Figures read from bills (usage by tariff, meter readings, charges, rates,
 * averages, comparisons). Kept per bill so later features can chart them,
 * compare periods and set limits.
 */

/** "Peak Usage" / "usage-peak" → "usage_peak". */
export function metricKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

/** The unit registry's spelling when it's a known unit ("kwh" → "kWh"), else as given. */
export function metricUnit(raw: string | null | undefined): string | null {
  const u = raw?.trim();
  if (!u) return null;
  return listUnits().find((x) => x.key.toLowerCase() === u.toLowerCase())?.key ?? u.slice(0, 30);
}

/** Replace a bill's figures with a fresh reading. Returns how many were kept. */
export function saveBillMetrics(
  householdId: string,
  billId: string,
  metrics: ExtractedMetric[] | null | undefined,
  db: Db = getDb(),
): number {
  const now = new Date().toISOString();
  const rows = (metrics ?? [])
    .map((m, i) => ({
      id: ulid(),
      householdId,
      billId,
      key: metricKey(m.key || m.label),
      label: m.label.trim().slice(0, 120) || m.key,
      kind: (METRIC_KINDS as readonly string[]).includes(m.kind) ? m.kind : ('other' as const),
      value: Number.isFinite(m.value) ? m.value : null,
      unit: metricUnit(m.unit),
      amountMinor: Number.isInteger(m.amountMinor) ? m.amountMinor : null,
      currency: m.amountMinor !== null ? (m.currency?.toUpperCase().slice(0, 3) ?? null) : null,
      periodStart: m.periodStart,
      periodEnd: m.periodEnd,
      position: i,
      createdAt: now,
    }))
    .filter((r) => r.key && (r.value !== null || r.amountMinor !== null));
  db.transaction((tx) => {
    tx.delete(billMetric)
      .where(and(eq(billMetric.householdId, householdId), eq(billMetric.billId, billId)))
      .run();
    if (rows.length) tx.insert(billMetric).values(rows).run();
    tx.update(bill)
      .set({ metricsReadAt: now })
      .where(and(eq(bill.householdId, householdId), eq(bill.id, billId)))
      .run();
  });
  return rows.length;
}

export function listBillMetrics(
  householdId: string,
  billId: string,
  db: Db = getDb(),
): BillMetric[] {
  return db
    .select()
    .from(billMetric)
    .where(and(eq(billMetric.householdId, householdId), eq(billMetric.billId, billId)))
    .orderBy(asc(billMetric.position))
    .all();
}

/** Bills that came from a document but were read before figures were kept. */
export function billsMissingMetrics(
  householdId: string,
  db: Db = getDb(),
): { id: string; sourceDocumentId: string }[] {
  return db
    .select({ id: bill.id, sourceDocumentId: bill.sourceDocumentId })
    .from(bill)
    .where(
      and(
        eq(bill.householdId, householdId),
        isNotNull(bill.sourceDocumentId),
        isNull(bill.metricsReadAt),
      ),
    )
    .all() as { id: string; sourceDocumentId: string }[];
}
