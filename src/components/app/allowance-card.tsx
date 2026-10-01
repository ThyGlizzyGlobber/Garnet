import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Icon } from '@/components/app/icons';
import { formatMoney } from '@/lib/format';
import type { AllowanceView } from '@/lib/allowance';

/**
 * The utilities allowance at a glance (SCOPE-accounts.md D17): the period,
 * used against the cap as a bar, what's left or what's over. On Home for
 * everyone in a let property with a cap; the page has the rest.
 */
export async function AllowanceCard({
  view,
  locale,
  periodWord,
  link = true,
}: {
  view: AllowanceView;
  locale: string;
  /** "month" / "quarter" / "year". */
  periodWord: string;
  link?: boolean;
}) {
  const t = await getTranslations('allowance');
  const money = (minor: number) => formatMoney(minor, view.currency, locale);
  const over = view.overMinor > 0;
  return (
    <div className="glass p-4 alw-card">
      <div className="alw-head">
        <b>
          <Icon name="building" width={16} height={16} />
          {t('card')} · {view.label}
        </b>
        {link && (
          <Link href="/allowance" className="link small">
            {t('open')}
          </Link>
        )}
      </div>
      <div className="alw-fig">
        <b>{money(view.usedMinor)}</b>
        <span className="muted">
          {t('used', { used: money(view.usedMinor), cap: money(view.capMinor) })}
        </span>
      </div>
      <div className={`alw-bar${over ? ' over' : ''}`} aria-hidden="true">
        <i style={{ width: `${Math.min(100, Math.round(view.fraction * 100))}%` }} />
      </div>
      <div className="alw-foot">
        <span className={over ? 'bad-text' : 'muted'}>
          {view.lines.length === 0
            ? t('nothing', { period: periodWord })
            : over
              ? t('overOwed', { over: money(view.overMinor) })
              : t('left', { left: money(view.leftMinor), period: periodWord })}
        </span>
      </div>
    </div>
  );
}
