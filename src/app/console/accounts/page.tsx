import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui';
import { Chip } from '@/components/ui/chip';
import { InlineAction } from '@/components/ui/form';
import { accountRows } from '@/lib/console';
import { formatDateTime } from '@/lib/format';
import {
  allowEmailsAction,
  deleteAccountAction,
  disallowEmailAction,
  signOutEverywhereAction,
} from '../actions';

/** Everyone who has signed in (SCOPE-console.md §3c): never a PIN, never "sign in as". */
export default async function ConsoleAccountsPage() {
  const t = await getTranslations('console.accounts');
  const ts = await getTranslations('settings.account');
  const rows = accountRows();
  const when = (iso: string | null) =>
    iso ? formatDateTime(iso, 'en-AU', 'Australia/Melbourne') : t('never');
  return (
    <Card>
      <p className="muted set-lede">{t('lede')}</p>
      <div className="con-scroll">
        <table className="con-table">
          <thead>
            <tr>
              <th>{t('email')}</th>
              <th>{t('name')}</th>
              <th>{t('signsIn')}</th>
              <th>{t('households')}</th>
              <th>{t('created')}</th>
              <th>{t('last')}</th>
              <th className="num">{t('devices')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id}>
                <td>
                  <span className="mono">{a.email}</span>
                  {a.developer && (
                    <>
                      {' '}
                      <Chip tone="info">dev</Chip>
                    </>
                  )}
                </td>
                <td>{a.name ?? '—'}</td>
                <td>{a.method === 'google' ? ts('google') : ts('code')}</td>
                <td>
                  {a.households.length
                    ? a.households.map((h) => `${h.name} (${h.member})`).join(', ')
                    : t('none')}
                </td>
                <td>{when(a.createdAt)}</td>
                <td>{when(a.lastSignInAt)}</td>
                <td className="num">{a.devices}</td>
                <td>
                  <div className="acts">
                    <InlineAction
                      action={signOutEverywhereAction}
                      hidden={{ accountId: a.id }}
                      label={t('signOutAll')}
                      variant="ghost"
                      confirm={t('signOutAllConfirm', { email: a.email })}
                    />
                    {a.listed ? (
                      <InlineAction
                        action={disallowEmailAction}
                        hidden={{ email: a.email }}
                        label={t('unlist')}
                        variant="ghost"
                      />
                    ) : (
                      <InlineAction
                        action={allowEmailsAction}
                        hidden={{ emails: a.email }}
                        label={t('list')}
                        variant="ghost"
                      />
                    )}
                    {a.households.length === 0 && (
                      <InlineAction
                        action={deleteAccountAction}
                        hidden={{ accountId: a.id }}
                        label={t('delete')}
                        variant="ghost"
                        confirm={t('deleteConfirm', { email: a.email })}
                      />
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
