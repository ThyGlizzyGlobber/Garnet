import Link from 'next/link';
import { Icon } from '@/components/app/icons';

/**
 * Page links under a long list: previous, the page numbers (the first, the
 * last and those around this one, gaps as "…"), next. Plain links, so it works
 * without script. Nothing when there's one page.
 */
export function Pager({
  page,
  pages,
  href,
  labels,
}: {
  page: number;
  pages: number;
  href: (page: number) => string;
  labels: { nav: string; previous: string; next: string; page: (n: number) => string };
}) {
  if (pages <= 1) return null;
  const shown = [...new Set([1, page - 1, page, page + 1, pages])]
    .filter((n) => n >= 1 && n <= pages)
    .sort((a, b) => a - b);
  const items: (number | 'gap')[] = [];
  shown.forEach((n, i) => {
    if (i > 0 && n - shown[i - 1]! > 1) items.push('gap');
    items.push(n);
  });
  return (
    <nav className="pager" aria-label={labels.nav}>
      {page > 1 ? (
        <Link href={href(page - 1)} className="pg-step" rel="prev">
          <Icon name="chevron-left" width={16} height={16} />
          <span>{labels.previous}</span>
        </Link>
      ) : (
        <span className="pg-step off" aria-hidden="true">
          <Icon name="chevron-left" width={16} height={16} />
          <span>{labels.previous}</span>
        </span>
      )}
      <span className="pg-nums">
        {items.map((n, i) =>
          n === 'gap' ? (
            <span key={`g${i}`} className="pg-gap" aria-hidden="true">
              …
            </span>
          ) : (
            <Link
              key={n}
              href={href(n)}
              className="pg-n"
              aria-current={n === page ? 'page' : undefined}
              aria-label={labels.page(n)}
            >
              {n}
            </Link>
          ),
        )}
      </span>
      {page < pages ? (
        <Link href={href(page + 1)} className="pg-step" rel="next">
          <span>{labels.next}</span>
          <Icon name="chevron-right" width={16} height={16} />
        </Link>
      ) : (
        <span className="pg-step off" aria-hidden="true">
          <span>{labels.next}</span>
          <Icon name="chevron-right" width={16} height={16} />
        </span>
      )}
    </nav>
  );
}
