import { getTranslations } from 'next-intl/server';
import { AuthShell, Notice } from '@/components/app/auth-shell';
import { Button } from '@/components/ui';
import { membershipsFor } from '@/lib/accounts';
import { authState } from '@/lib/auth/session';
import { findInviteByToken } from '@/lib/invites';
import { acceptInviteAction, signInForInviteAction } from '../../welcome/actions';

export const dynamic = 'force-dynamic';

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await getTranslations('invite');
  const found = findInviteByToken(decodeURIComponent(token));
  if (!found)
    return (
      <AuthShell title={t('invalid.title')} subtitle={t('invalid.body')}>
        {null}
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
  const already = account ? membershipsFor(account.id).length > 0 : false;
  return (
    <AuthShell
      title={t('title', vars)}
      subtitle={found.invitedBy ? t('body', vars) : t('bodyNoInviter', vars)}
    >
      {account ? (
        already ? (
          <Notice>{t('already')}</Notice>
        ) : (
          <form action={acceptInviteAction} className="flex flex-col gap-3">
            <input type="hidden" name="token" value={decodeURIComponent(token)} />
            <p className="text-xs text-fg-muted">{t('signedInAs', { email: account.email })}</p>
            <Button type="submit">{t('accept')}</Button>
          </form>
        )
      ) : (
        <form action={signInForInviteAction}>
          <input type="hidden" name="token" value={decodeURIComponent(token)} />
          <Button type="submit" className="w-full">
            {t('signInToAccept')}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
