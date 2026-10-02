import { getTranslations } from 'next-intl/server';
import { saveNotifyPrefsAction } from '@/app/(app)/members/actions';
import { NotifyForm } from '@/app/(app)/members/notify-form';
import { Card } from '@/components/ui';
import { EmptyCard, PageTitle, SectionHead } from '@/components/ui/blocks';
import { membershipsFor } from '@/lib/accounts';
import { accountContext } from '../context';

/** The emails each of your households sends you: a card per household. */
export default async function AccountNotificationsPage() {
  const { account, view } = await accountContext();
  const t = await getTranslations('profile.notifications');
  const members = account ? membershipsFor(account.id) : [];
  const byMember = new Map(members.map((m) => [m.id, m]));
  return (
    <div className="scr account pf">
      <PageTitle
        title={t('title')}
        lede={view.email ? t('lede', { email: view.email }) : t('demo')}
      />
      {!account || view.tiles.length === 0 ? (
        <EmptyCard icon="bell" title={t('emptyTitle')} body={t('emptyBody')} />
      ) : (
        <div className="pf-grid">
          {view.tiles.map((h) => {
            const m = byMember.get(h.memberId);
            if (!m) return null;
            return (
              <Card key={h.memberId}>
                <SectionHead title={h.name} />
                <NotifyForm
                  action={saveNotifyPrefsAction}
                  memberId={m.id}
                  initial={{
                    bills: m.notifyBills,
                    reminders: m.notifyReminders,
                    problems: m.notifyProblems,
                  }}
                />
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
