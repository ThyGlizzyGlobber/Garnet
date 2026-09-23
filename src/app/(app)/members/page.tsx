import { getTranslations } from 'next-intl/server';
import { Badge, LinkButton, List, ListRow, PageHeader } from '@/components/ui';
import { pageContext } from '@/lib/context';
import { listMembers } from '@/lib/members';

export default async function MembersPage() {
  const { hh, me, date, today } = await pageContext();
  const t = await getTranslations('members');
  const members = listMembers();
  return (
    <>
      <PageHeader
        title={t('title')}
        subtitle={hh.splitMode === 'single' ? t('singleNote') : undefined}
        action={<LinkButton href="/members/new">{t('add')}</LinkButton>}
      />
      <List>
        {members.map((m) => {
          const active = m.activeFrom <= today && (!m.activeTo || m.activeTo >= today);
          const canEdit = me.role === 'owner' || me.id === m.id;
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
              <div className="flex items-center gap-2">
                {m.role === 'owner' && <Badge tone="accent">{t('owner')}</Badge>}
                {!active && <Badge>{t('inactive')}</Badge>}
              </div>
            </ListRow>
          );
        })}
      </List>
    </>
  );
}
