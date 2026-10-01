import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { AuthShell, AuthSide } from '@/components/app/auth-shell';
import { authState, pathFor } from '@/lib/auth/session';
import { getHousehold } from '@/lib/households';
import { listMembers } from '@/lib/members';
import { JoinedForm } from './joined-form';
import { saveJoinedAction } from './actions';

export const dynamic = 'force-dynamic';

/**
 * Just joined a household by invite: how they appear there (their name and
 * avatar colour are per household, and the inviter's guess at a name may be
 * wrong). Then the account's PIN, the first time; otherwise straight in.
 */
export default async function JoinedPage() {
  const state = await authState();
  if (state.kind !== 'needs-pin' && state.kind !== 'ok') redirect(pathFor(state) ?? '/');
  if (state.kind === 'ok' && state.demo) redirect('/');
  const t = await getTranslations('joined');
  const hh = getHousehold(state.member.householdId);
  const others = listMembers(state.member.householdId)
    .filter((m) => m.id !== state.member.id && m.accountId)
    .map((m) => m.name);
  return (
    <AuthShell
      side={<AuthSide title={t('side')}>{t('sideBody', { household: hh?.name ?? '' })}</AuthSide>}
    >
      <div className="pin-head">
        <h2>{t('title', { household: hh?.name ?? '' })}</h2>
        <p className="muted">
          {others.length
            ? t('body', { names: new Intl.ListFormat('en').format(others) })
            : t('bodyAlone')}
        </p>
      </div>
      <JoinedForm action={saveJoinedAction} name={state.member.name} colour={state.member.colour} />
    </AuthShell>
  );
}
