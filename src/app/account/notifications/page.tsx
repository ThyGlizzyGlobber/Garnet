import { getTranslations } from 'next-intl/server';
import { Icon } from '@/components/app/icons';
import { EmptyCard, PageTitle } from '@/components/ui/blocks';
import { Switch } from '@/components/ui/switch';
import { membershipsFor } from '@/lib/accounts';
import type { NotifyCategory } from '@/lib/notifications';
import { toggleNotifyAction } from '../actions';
import { accountContext } from '../context';

const KINDS: NotifyCategory[] = ['bills', 'reminders', 'problems'];

/**
 * Notifications (SCOPE-redesign-2.md §4): one grid. Rows are the kinds of
 * email with their description written once; columns are your households;
 * each cell a switch that saves as it's flipped. Under 900 px it stacks,
 * each switch beside its household's name.
 */
export default async function AccountNotificationsPage() {
  const { account, view } = await accountContext();
  const t = await getTranslations('profile.notifications');
  const tp = await getTranslations('notify.prefs');
  const members = account ? membershipsFor(account.id) : [];
  const byMember = new Map(members.map((m) => [m.id, m]));
  const households = view.tiles.filter((h) => byMember.has(h.memberId));
  const on = (memberId: string, kind: NotifyCategory) => {
    const m = byMember.get(memberId)!;
    return kind === 'bills'
      ? m.notifyBills
      : kind === 'reminders'
        ? m.notifyReminders
        : m.notifyProblems;
  };
  return (
    <div className="scr account">
      <PageTitle
        title={t('title')}
        lede={view.email ? t('lede', { email: view.email }) : t('demo')}
      />
      {!account || households.length === 0 ? (
        <EmptyCard icon="bell" title={t('emptyTitle')} body={t('emptyBody')} />
      ) : (
        <div className="nt-wrap">
          <section
            className="rd-card nt-card"
            aria-label={t('title')}
            style={{ ['--hh' as string]: households.length }}
          >
            <div className="nhead">
              <span className="nhead-l">{t('emailMeWhen')}</span>
              {households.map((h) => (
                <span key={h.memberId}>{h.name}</span>
              ))}
            </div>
            {KINDS.map((kind) => (
              <div key={kind} className="nrow">
                <span className="t">
                  <span className="nrow-t">{tp(`${kind}Title`)}</span>
                  <span className="lr-sub wrap">{tp(`${kind}Sub`)}</span>
                </span>
                {households.map((h) => (
                  <span key={h.memberId} className="cell" data-h={h.name}>
                    <Switch
                      checked={on(h.memberId, kind)}
                      label={t('switchLabel', { kind: tp(`${kind}Title`), household: h.name })}
                      action={toggleNotifyAction.bind(null, h.memberId, kind)}
                    />
                  </span>
                ))}
              </div>
            ))}
            <div className="msec-end" />
          </section>
          <p className="rd-note">
            <Icon name="check" width={16} height={16} />
            {t('saveAsYouGo')}
          </p>
        </div>
      )}
    </div>
  );
}
