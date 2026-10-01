import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui';
import { auditLines } from '@/lib/audit';
import { formatDateTime } from '@/lib/format';

const PAGE = 100;

/** The audit log (SCOPE-console.md §3f): what developers did, newest first, kept for good. */
export default async function ConsoleAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const { p } = await searchParams;
  const page = Math.max(1, Number(p) || 1);
  const t = await getTranslations('console.audit');
  const lines = auditLines(undefined, { limit: PAGE + 1, offset: (page - 1) * PAGE });
  const more = lines.length > PAGE;
  const shown = lines.slice(0, PAGE);
  const actionWord = (a: string) => {
    try {
      return t(`actions.${a}`);
    } catch {
      return a;
    }
  };
  return (
    <Card>
      <p className="muted set-lede">{t('lede')}</p>
      {shown.length === 0 ? (
        <p className="muted">{t('empty')}</p>
      ) : (
        <div className="con-scroll">
          <table className="con-table">
            <thead>
              <tr>
                <th>{t('when')}</th>
                <th>{t('who')}</th>
                <th>{t('what')}</th>
                <th>{t('target')}</th>
                <th>{t('detail')}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((l) => (
                <tr key={l.id}>
                  <td className="muted small">
                    {formatDateTime(l.at, 'en-AU', 'Australia/Melbourne')}
                  </td>
                  <td className="mono small">{l.email ?? t('startup')}</td>
                  <td>{actionWord(l.action)}</td>
                  <td>{l.targetName ?? ''}</td>
                  <td className="muted small">
                    {l.detail
                      ? Object.entries(l.detail)
                          .map(([k, v]) => `${k}: ${v === null ? '—' : String(v)}`)
                          .join(' · ')
                      : ''}
                    {l.ip && ` · ${l.ip}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {more && (
        <p>
          <Link href={`/console/audit?p=${page + 1}`} className="link small">
            {t('more')}
          </Link>
        </p>
      )}
    </Card>
  );
}
