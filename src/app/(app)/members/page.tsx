import { getTranslations } from 'next-intl/server';
import { Icon } from '@/components/app/icons';
import { LinkButton } from '@/components/ui';
import { PageTitle } from '@/components/ui/blocks';
import { Avatar } from '@/components/ui/colour';
import { ListRow, RowCard } from '@/components/ui/list-row';
import { getAccount } from '@/lib/accounts';
import { pageContext } from '@/lib/context';
import { roleKey } from '@/lib/household-types';
import { joinStatus, latestInvites } from '@/lib/invites';
import { listMembers } from '@/lib/members';
import { avatarUrl } from '@/lib/profile';
import { isAdmin } from '@/lib/roles';

/**
 * Members (SCOPE-redesign-2.md §4): one card with a row per person: their
 * avatar, name (with a quiet You on the viewer), how they sign in and since
 * when, their role as a pill (Admin outlined, Member subtle), a chevron to
 * their page. Invite someone top right; one quiet line under the list.
 */
export default async function MembersPage() {
  const { hh, me } = await pageContext();
  const t = await getTranslations('members');
  const tr = await getTranslations('members.rd');
  const troles = await getTranslations('roles');
  const members = listMembers(hh.id);
  const invites = latestInvites(hh.id);
  const admin = isAdmin(me);
  const shared = hh.splitMode === 'shared';
  const solo = members.length <= 1;
  const monthYear = new Intl.DateTimeFormat(hh.locale, { month: 'short', year: 'numeric' });

  return (
    <div className="scr">
      <PageTitle
        title={t('title')}
        lede={solo ? t('ledeSolo') : tr('lede', { count: members.length, household: hh.name })}
        right={
          admin ? (
            <LinkButton href="/members/new" icon="plus">
              {t('inviteSomeone')}
            </LinkButton>
          ) : undefined
        }
      />
      <RowCard>
        {members.map((m) => {
          const canOpen = admin || me.id === m.id;
          const status = joinStatus(m, invites.get(m.id));
          const acct = m.accountId ? getAccount(m.accountId) : null;
          // "Since" is when they joined the household (the member record), never a placeholder date.
          const since = m.accountId
            ? tr('since', { date: monthYear.format(new Date(m.createdAt)) })
            : null;
          const signsIn = m.accountId
            ? acct?.googleSub
              ? t('signsIn.google')
              : t('signsIn.code')
            : status === 'pending'
              ? tr('invited')
              : tr('notJoined');
          const sub = [signsIn, since].filter(Boolean).join(' · ');
          return (
            <ListRow
              key={m.id}
              href={canOpen ? `/members/${m.id}/edit` : undefined}
              lead={<Avatar name={m.name} colour={m.colour} photo={avatarUrl(acct)} size="lg" />}
              name={m.name}
              mark={m.id === me.id ? <span className="you">{tr('you')}</span> : undefined}
              sub={sub}
              status={
                <span className={`role ${isAdmin(m) ? 'admin' : 'mem'}`}>
                  {troles(roleKey(m.role, hh.type))}
                </span>
              }
              end={null}
              chevron={canOpen}
              className="mem-row"
              ariaLabel={canOpen ? tr('open', { name: m.name }) : undefined}
            />
          );
        })}
      </RowCard>
      <p className="rd-note">
        <Icon name="info" width={16} height={16} />
        {shared ? t('footAdmins') : t('singleNote')}
      </p>
    </div>
  );
}
