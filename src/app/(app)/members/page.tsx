import { getTranslations } from 'next-intl/server';
import { Badge, LinkButton, List, ListRow, PageHeader } from '@/components/ui';
import { pageContext } from '@/lib/context';
import { inviteState, latestInvites } from '@/lib/invites';
import { listMembers } from '@/lib/members';

export default async function MembersPage() {
  const { hh, me, date, today } = await pageContext();
  const t = await getTranslations('members');
  const members = listMembers(hh.id);
  const invites = latestInvites(hh.id);
  const admin = me.role === 'owner';
  return (
    <>
      <PageHeader
        title={t('title')}
        subtitle={hh.splitMode === 'single' ? t('singleNote') : undefined}
        action={admin ? <LinkButton href="/members/new">{t('add')}</LinkButton> : undefined}
      />
      <List>
        {members.map((m) => {
          const active = m.activeFrom <= today && (!m.activeTo || m.activeTo >= today);
          const canEdit = admin || me.id === m.id;
          const status = m.accountId
            ? 'joined'
            : inviteState(invites.get(m.id)) === 'pending'
              ? 'pending'
              : inviteState(invites.get(m.id)) === 'expired'
                ? 'expired'
                : 'none';
          return (
            <ListRow key={m.id} href={canEdit ? `/members/${m.id}/edit` : undefined}>
              <div className="flex items-center gap-3">
                <span
                  className="grid size-10 place-items-center rounded-full text-sm font-bold text-white"
                  style={{ background: m.colour }}
                >
                  {m.name.slice(0, 1).toUpperCase()}
                </span>
                <div>
                  <p className="font-semibold">
                    {m.name}{' '}
                    {m.id === me.id && (
                      <span className="text-xs font-normal text-fg-muted">({t('you')})</span>
                    )}
                  </p>
                  <p className="text-xs text-fg-muted">
                    {t('since', { date: date(m.activeFrom, 'short') })}
                    {m.activeTo && ` · ${t('until', { date: date(m.activeTo, 'short') })}`}
                    {hh.splitMode === 'shared' &&
                      m.splitWeight !== 1 &&
                      ` · ${t('weight', { weight: m.splitWeight })}`}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {m.role === 'owner' && <Badge tone="accent">{t('owner')}</Badge>}
                {!active && <Badge>{t('inactive')}</Badge>}
                {admin && status !== 'joined' && (
                  <Badge tone={status === 'pending' ? 'warning' : 'neutral'}>
                    {t(`status.${status}`)}
                  </Badge>
                )}
              </div>
            </ListRow>
          );
        })}
      </List>
    </>
  );
}
