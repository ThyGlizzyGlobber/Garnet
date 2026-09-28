import type { Change } from '@/lib/consumption';

/**
 * Small building blocks for showing usage. Deliberately plain: the numbers and
 * wording live here and in lib/consumption, so a redesign only swaps markup.
 */

/** Below this, a change reads as "about the same". */
export const SAME_BAND = 0.02;

/** 191.3 → "191", 11.04 → "11", 3.456 → "3.5", 0.4457 → "0.45" (quantities, not money). */
export function formatQty(n: number, locale: string): string {
  const a = Math.abs(n);
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: a >= 100 ? 0 : a >= 1 ? 1 : 2,
  }).format(n);
}

export type ChangeWords = { more: string; less: string; same: string };

/**
 * "▲ 8% more" / "▼ 8% less" / "about the same". Using more is flagged in the
 * warning colour and using less in the success colour; set neutral for
 * figures where more isn't worse (e.g. a comparison line in a list).
 */
export function ChangeText({
  change,
  words,
  neutral = false,
  className = '',
}: {
  change: Change | null | undefined;
  words: (pct: number) => ChangeWords;
  neutral?: boolean;
  className?: string;
}) {
  if (!change || change.pct === null) return null;
  const pct = Math.round(Math.abs(change.pct) * 100);
  const w = words(pct);
  if (Math.abs(change.pct) < SAME_BAND)
    return <span className={`text-fg-muted ${className}`}>{w.same}</span>;
  const up = change.pct > 0;
  const tone = neutral ? 'text-fg-muted' : up ? 'text-warning' : 'text-success';
  return (
    <span className={`${tone} tabular-nums ${className}`}>
      <span aria-hidden="true">{up ? '▲' : '▼'}</span> {up ? w.more : w.less}
    </span>
  );
}
