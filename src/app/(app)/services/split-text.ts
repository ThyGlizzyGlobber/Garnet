import type { SplitPart } from '@/lib/split-view';

type T = (key: string, values?: Record<string, string | number>) => string;

/** One person's setting in words: "40%", "$400.00 a bill", "Shares the rest", "Even share". */
export function partText(t: T, setting: SplitPart['setting'], money: (minor: number) => string) {
  switch (setting.kind) {
    case 'percent':
      return setting.value > 0 ? t('parts.percent', { value: setting.value }) : t('parts.none');
    case 'amount':
      return setting.minor > 0
        ? t('parts.amount', { amount: money(setting.minor) })
        : t('parts.none');
    case 'rest':
      return t('parts.rest');
    case 'weight':
      return t('parts.weight', { value: setting.value });
    case 'even':
      return t('parts.even');
  }
}
