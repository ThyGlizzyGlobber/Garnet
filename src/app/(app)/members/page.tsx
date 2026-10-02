import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Icon } from '@/components/app/icons';
import { LinkButton } from '@/components/ui';
import { PageTitle } from '@/components/ui/blocks';
import { Chip } from '@/components/ui/chip';
import { Avatar } from '@/components/ui/colour';
import { getAccount } from '@/lib/accounts';
import { avatarUrl } from '@/lib/profile';
import { pageContext } from '@/lib/context';
import { joinStatus, latestInvites } from '@/lib/invites';
import { isActiveOn, listMembers } from '@/lib/members';
import { colourCss } from '@/lib/palette';
import { isAdmin } from '@/lib/roles';
import { roleKey } from '@/lib/household-types';
import { memberLedger } from '@/lib/stats';

/**
 * Who lives here and what they can do: a card per person (how they sign in,
 * admin or member, since when, what they owe now), and Invite someone.
 */
export default async function MembersPage() {
  const { hh, me, date, today, money } = await pageContext();
  const t = await getTranslations('members');
  const members = listMembers(hh.id);
  const invites = latestInvites(hh.id);
  const admin = isAdmin(me);
  const tr = await getTranslations('roles');
  const shared = hh.splitMode === 'shared';
  const solo = members.length <= 1;

  return (
    <div className="scr">
      <PageTitle
        title={t('title')}
        lede={solo ? t('ledeSolo') : t('lede', { household: hh.name })}
        right={
          admin ? (
            <LinkButton href="/members/new" icon="plus">
              {t('inviteSomeone')}
            </LinkButton>
          ) : undefined
        }
      />
      <div className="mgrid">
        {members.map((m) => {
          const active = isActiveOn(m, today);
          const canOpen = admin || me.id === m.id;
          const status = joinStatus(m, invites.get(m.id));
          const ledger = shared ? memberLedger(hh.id, m.id, today, hh.fiscalYearStartMonth) : null;
          const acct = m.accountId ? getAccount(m.accountId) : null;
          const signsIn = m.accountId
            ? acct?.googleSub
              ? t('signsIn.google')
              : t('signsIn.code')
            : status === 'pending'
              ? t('signsIn.invited')
              : t('signsIn.notJoined');
          const line = m.id === me.id ? `${t('you')} · ${signsIn}` : signsIn;
          const top = (
            <>
              <Avatar name={m.name} colour={m.colour} photo={avatarUrl(acct)} size="lg" />
              <span>
                <b>{m.name}</b>
                <span className="muted small">{line}</span>
              </span>
              {canOpen && <Icon name="chevron-right" width={18} height={18} className="chev" />}
            </>
          );
          return (
            <article
              key={m.id}
              className="glass rounded-card mcard"
              style={{ ['--m' as string]: colourCss(m.colour) }}
            >
              {canOpen ? (
                <Link href={`/members/${m.id}/edit`} className="mcard-top">
                  {top}
                </Link>
              ) : (
                <div className="mcard-top">{top}</div>
              )}
              <div className="mcard-chips">
                <Chip tone={isAdmin(m) ? 'info' : 'neutral'} icon={isAdmin(m) ? 'shield' : 'user'}>
                  {tr(roleKey(m.role, hh.type))}
                </Chip>
                {status === 'pending' && admin && (
                  <Chip tone="warn" icon="mail">
                    {t('status.pending')}
                  </Chip>
                )}
                {status === 'expired' && admin && (
                  <Chip tone="neutral" icon="mail">
                    {t('status.expired')}
                  </Chip>
                )}
                {!active ? (
                  <Chip tone="neutral" icon="home">
                    {m.activeTo ? t('until', { date: date(m.activeTo, 'short') }) : t('inactive')}
                  </Chip>
                ) : (
                  <Chip tone="neutral" icon="home">
                    {t('since', { date: date(m.activeFrom) })}
                  </Chip>
                )}
              </div>
              {ledger && (
                <p className="muted small">
                  {ledger.owed > 0
                    ? t('tile.owesNow', { amount: money(ledger.owed), count: ledger.unpaid.length })
                    : t('tile.nothingOwed')}
                  {ledger.owedToMe > 0 &&
                    ` · ${t('tile.owedToThem', { amount: money(ledger.owedToMe) })}`}
                </p>
              )}
              {admin && !m.accountId && (
                <div className="form-acts">
                  <LinkButton
                    href={`/members/${m.id}/invite`}
                    variant="secondary"
                    size="sm"
                    icon="mail"
                  >
                    {status === 'pending' ? t('resendInvite') : t('invite.cta')}
                  </LinkButton>
                </div>
              )}
            </article>
          );
        })}
      </div>
      <p className="muted small">{shared ? t('footAdmins') : t('singleNote')}</p>
    </div>
  );
}
