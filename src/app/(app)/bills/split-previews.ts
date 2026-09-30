import { getTranslations } from 'next-intl/server';
import type { Household } from '@/db/schema';
import type { ServiceWithType } from '@/lib/services';
import { splitView } from '@/lib/split-view';
import type { SplitPreview } from './bill-form';

/**
 * For the bill form: how each household service splits a bill, as each
 * person's fraction of it (from what they'd pay of the latest bill, else an
 * even share), so the form can show the parts as the amount is typed.
 */
export async function splitPreviews(
  hh: Household,
  services: ServiceWithType[],
): Promise<Record<string, SplitPreview>> {
  if (hh.splitMode !== 'shared') return {};
  const t = await getTranslations('services.split');
  const out: Record<string, SplitPreview> = {};
  for (const s of services) {
    if (s.ownerMemberId) continue;
    const v = splitView(hh.id, s);
    if (v.parts.length === 0) continue;
    const known = v.latestMinor && v.parts.every((p) => p.exampleMinor !== null);
    const fractions = known
      ? v.parts.map((p) => p.exampleMinor! / v.latestMinor!)
      : v.mode === 'percent'
        ? v.parts.map((p) => (v.percents[p.member.id] ?? 0) / 100)
        : v.parts.map(() => 1 / v.parts.length);
    out[s.id] = {
      how:
        v.mode === 'percent'
          ? t('howPercent', {
              parts: v.parts.map((p) => Math.round((v.percents[p.member.id] ?? 0) * 1)).join(' / '),
            })
          : v.mode === 'fixed'
            ? t('howFixed')
            : t('howEven'),
      parts: v.parts.map((p, i) => ({
        name: p.member.name,
        colour: p.member.colour,
        fraction: fractions[i]!,
      })),
    };
  }
  return out;
}
