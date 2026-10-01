import { getTranslations } from 'next-intl/server';
import { AuthShell, AuthSide, Notice } from '@/components/app/auth-shell';
import { Button } from '@/components/ui';
import { Avatar, Avatars } from '@/components/ui/colour';
import { membershipsFor } from '@/lib/accounts';
import { authState } from '@/lib/auth/session';
import { formatDate } from '@/lib/format';
import { findInviteByToken } from '@/lib/invites';
import { listMembers } from '@/lib/members';
import { acceptInviteAction, signInForInviteAction } from '../../welcome/actions';

export const dynamic = 'force-dynamic';

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await getTranslations('invite');
  const found = findInviteByToken(decodeURIComponent(token));
  if (!found)
    return (
      <AuthShell>
        <div className="pin-head">
          <h2>{t('invalid.title')}</h2>
          <p className="muted">{t('invalid.body')}</p>
        </div>
      </AuthShell>
    );
  const state = await authState();
  const account =
    state.kind === 'ok' || state.kind === 'no-household' || state.kind === 'needs-pin'
      ? state.account
      : null;
  const vars = {
    household: found.household.name,
    member: found.member.name,
    inviter: found.invitedBy?.name ?? '',
  };
  const already = account
    ? membershipsFor(account.id).some((m) => m.householdId === found.household.id)
    : false;
  // The people already there, so the card shows who they'll share with.
  const others = listMembers(found.household.id).filter(
    (m) => m.id !== found.member.id && m.accountId,
  );
  const names = others.map((m) => m.name);
  return (
    <AuthShell
      side={
        <AuthSide title={t('side')}>
          {found.invitedBy && (
            <Avatar name={found.invitedBy.name} colour={found.invitedBy.colour} size="sm" />
          )}
          {found.invitedBy ? t('sideBody', vars) : t('sideBodyNoInviter', vars)}
        </AuthSide>
      }
    >
      <div className="invite-card">
        {others.length > 0 && <Avatars members={others} size="md" />}
        <h2>{found.invitedBy ? t('title', vars) : t('titleNoInviter', vars)}</h2>
        <p className="muted">
          {names.length > 0 && t('with', { names: new Intl.ListFormat('en').format(names) })}{' '}
          {t.rich('since', {
            member: vars.member,
            date: formatDate(
              found.member.activeFrom,
              found.household.locale,
              found.household.timezone,
            ),
            b: (c) => <b>{c}</b>,
          })}
        </p>
      </div>
      {account ? (
        already ? (
          <Notice>{t('already')}</Notice>
        ) : (
          <form action={acceptInviteAction} className="auth-form">
            <input type="hidden" name="token" value={decodeURIComponent(token)} />
            <Button type="submit" className="wide">
              {t('accept')}
            </Button>
            <p className="muted small t-center">{t('signedInAs', { email: account.email })}</p>
          </form>
        )
      ) : (
        <form action={signInForInviteAction} className="auth-form">
          <input type="hidden" name="token" value={decodeURIComponent(token)} />
          <Button type="submit" className="wide">
            {t('signInToAccept')}
          </Button>
          <p className="muted small t-center">{t('signInWhy')}</p>
        </form>
      )}
    </AuthShell>
  );
}
