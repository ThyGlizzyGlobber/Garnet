import { getTranslations } from 'next-intl/server';
import { Button, Card } from '@/components/ui';
import { Chip } from '@/components/ui/chip';
import { InlineAction } from '@/components/ui/form';
import { householdRows } from '@/lib/console';
import { authState } from '@/lib/auth/session';
import { getEnv } from '@/lib/env';
import { formatDate, formatMoney } from '@/lib/format';
import { switchHouseholdAction } from '@/app/account/actions';
import { addressOffAction, deleteDemoHouseholdAction, setAiCapAction } from '../actions';

/** Every household as counts (SCOPE-console.md §3b). Opening one needs membership; nothing else does. */
export default async function ConsoleHouseholdsPage() {
  const t = await getTranslations('console.households');
  const tt = await getTranslations('householdTypes');
  const s = await authState();
  const rows = householdRows(s.account?.id ?? null);
  const limit = getEnv().AI_MONTHLY_LIMIT;
  const day = (iso: string | null) =>
    iso ? formatDate(`${iso.slice(0, 10)}T00:00:00Z`, 'en-AU', 'UTC', 'short') : '—';
  return (
    <Card>
      <p className="muted set-lede">{t('lede')}</p>
      <div className="con-scroll">
        <table className="con-table">
          <thead>
            <tr>
              <th>{t('name')}</th>
              <th>{t('type')}</th>
              <th className="num">{t('people')}</th>
              <th>{t('created')}</th>
              <th>{t('active')}</th>
              <th className="num">{t('bills')}</th>
              <th className="num">{t('reads')}</th>
              <th>{t('cap')}</th>
              <th>{t('address')}</th>
              <th>{t('sharing')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((h) => (
              <tr key={h.id}>
                <td>
                  <b>{h.name}</b>
                  {h.isDemo && (
                    <>
                      {' '}
                      <Chip tone="neutral">{t('demo')}</Chip>
                    </>
                  )}
                </td>
                <td>{h.type ? tt(`${h.type}.name`) : t('untyped')}</td>
                <td className="num">{h.people}</td>
                <td>{day(h.createdAt)}</td>
                <td>{day(h.lastActivity)}</td>
                <td className="num">
                  {h.billsThisMonth.count} ·{' '}
                  {formatMoney(h.billsThisMonth.totalMinor, h.billsThisMonth.currency, 'en-AU', {
                    whole: true,
                  })}
                </td>
                <td className="num">{h.readsThisMonth}</td>
                <td>
                  <form action={setAiCapAction} className="con-inline">
                    <input type="hidden" name="householdId" value={h.id} />
                    <input
                      name="cap"
                      inputMode="numeric"
                      defaultValue={h.aiCap === null ? '' : String(h.aiCap)}
                      placeholder={String(limit)}
                      aria-label={t('setCap')}
                      className="inp-plain"
                      title={t('capHint')}
                    />
                    <Button type="submit" size="sm" variant="ghost">
                      {t('save')}
                    </Button>
                  </form>
                  <span className="muted small">
                    {h.aiCap === null
                      ? t('capDefault', { limit })
                      : h.aiCap === 0
                        ? t('capNone')
                        : t('capN', { n: h.aiCap })}
                  </span>
                </td>
                <td>{h.addressOn ? t('addressOn') : t('addressOff')}</td>
                <td>{h.sharing ? t('sharingOn') : t('sharingOff')}</td>
                <td>
                  <div className="acts">
                    {h.myMemberId ? (
                      <form action={switchHouseholdAction}>
                        <input type="hidden" name="memberId" value={h.myMemberId} />
                        <button type="submit" className="link small">
                          {t('open')}
                        </button>
                      </form>
                    ) : (
                      <span className="muted small">{t('notMember')}</span>
                    )}
                    {h.addressOn && (
                      <InlineAction
                        action={addressOffAction}
                        hidden={{ householdId: h.id }}
                        label={t('addressOffCta')}
                        variant="ghost"
                        confirm={t('addressOffConfirm', { household: h.name })}
                      />
                    )}
                    {h.isDemo && (
                      <InlineAction
                        action={deleteDemoHouseholdAction}
                        hidden={{ householdId: h.id }}
                        label={t('deleteDemo')}
                        variant="ghost"
                        confirm={t('deleteDemoConfirm', { household: h.name })}
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
