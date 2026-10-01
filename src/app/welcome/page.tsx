import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { AuthHead, AuthShell } from '@/components/app/auth-shell';
import { JoinCodeForm, PinForm } from '@/components/app/auth-forms';
import { Choice } from '@/components/app/pieces';
import { accountGivenName, isOperator, unclaimedOwners } from '@/lib/accounts';
import { authState, pathFor } from '@/lib/auth/session';
import { logout } from '../login/actions';
import { claimOwnerAction, joinWithCodeAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function WelcomePage() {
  const state = await authState();
  if (state.kind !== 'no-household') redirect(pathFor(state) ?? '/');
  const t = await getTranslations('welcome');
  const claimable = isOperator(state.account) ? unclaimedOwners() : [];
  const name = accountGivenName(state.account);
  return (
    <AuthShell>
      <AuthHead title={name ? t('title', { name }) : t('titleNoName')}>
        {t.rich('subtitle', { email: state.account.email, b: (c) => <b>{c}</b> })}
      </AuthHead>
      {claimable.map((m) => (
        <Choice
          key={m.id}
          icon="link"
          title={t('claim.title')}
          sub={t('claim.body', {
            household: m.householdName,
            member: m.name,
            email: state.account.email,
          })}
          col
        >
          <PinForm
            action={claimOwnerAction}
            label={t('claim.pin')}
            submitLabel={t('claim.cta')}
            hidden={{ memberId: m.id }}
          />
        </Choice>
      ))}
      <Choice icon="home" title={t('create.title')} sub={t('create.body')} href="/setup" />
      <Choice icon="users" title={t('join.title')} sub={t('join.body')} col>
        <JoinCodeForm action={joinWithCodeAction} />
      </Choice>
      <div className="muted small t-center">
        <form action={logout} className="inline-form">
          <button className="link">{t('signOut')}</button>
        </form>
      </div>
    </AuthShell>
  );
}
