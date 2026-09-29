import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { formatMonth } from '@/lib/format';
import { seasonNoticeText } from '@/lib/season-text';
import type { SeasonNotice } from '@/lib/seasons';

/**
 * "Winter starts in 22 days. Last winter, your Electricity cost 40% more a
 * day…" — one card per seasonal service with evidence from last year. Plain
 * markup on purpose; the wording lives in lib/season-text for a redesign.
 */
export async function SeasonAhead({
  notices,
  locale,
  money,
  linkToService = true,
  className = '',
}: {
  notices: SeasonNotice[];
  locale: string;
  money: (minor: number, currency?: string) => string;
  linkToService?: boolean;
  className?: string;
}) {
  if (!notices.length) return null;
  const t = await getTranslations('seasons');
  const tr = (key: string, vars?: Record<string, string | number>) =>
    t(key as Parameters<typeof t>[0], vars as Parameters<typeof t>[1]);
  const f = { money, month: (ym: string) => formatMonth(ym, locale, 'long-year') };
  return (
    <section className={`glass rounded-card p-5 ${className}`} aria-label={t('heading')}>
      <h2 className="text-xs font-semibold tracking-wide text-fg-muted uppercase">
        {t('heading')}
      </h2>
      <ul className="mt-2 flex flex-col gap-3">
        {notices.map((n) => {
          const text = seasonNoticeText(n, tr, f);
          return (
            <li key={n.serviceId}>
              <p className="font-display text-lg font-semibold">
                {linkToService ? (
                  <Link href={`/services/${n.serviceId}`} className="hover:text-accent">
                    {text.title} · {n.serviceName}
                  </Link>
                ) : (
                  text.title
                )}
              </p>
              <p className="mt-0.5 text-sm text-fg-muted">{text.lines.join(' ')}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
