import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { AuthShell } from '@/components/app/auth-shell';
import { JoinCodeForm, PinForm } from '@/components/app/auth-forms';
import { Card, LinkButton } from '@/components/ui';
import { isOperator, unclaimedOwners } from '@/lib/accounts';
import { authState, pathFor } from '@/lib/auth/session';
import { logout } from '../login/actions';
import { claimOwnerAction, joinWithCodeAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function WelcomePage() {
  const state = await authState();
  if (state.kind !== 'no-household') redirect(pathFor(state) ?? '/');
  const t = await getTranslations('welcome');
  const claimable = isOperator(state.account) ? unclaimedOwners() : [];
  return (
    <AuthShell title={t('title', { name: state.account.name })} subtitle={t('subtitle')}>
      {claimable.map((m) => (
        <Card key={m.id} className="flex flex-col gap-3">
          <h2 className="font-display font-semibold">{t('claim.title')}</h2>
          <p className="text-sm">
            <strong>{m.householdName}</strong> · {m.name}
          </p>
          <p className="text-xs text-fg-muted">{t('claim.body', { email: state.account.email })}</p>
          <PinForm
            action={claimOwnerAction}
            label={t('claim.pin')}
            submitLabel={t('claim.cta')}
            hidden={{ memberId: m.id }}
          />
        </Card>
      ))}
      <Card className="flex flex-col gap-3">
        <h2 className="font-display font-semibold">{t('create.title')}</h2>
        <p className="text-sm text-fg-muted">{t('create.body')}</p>
        <LinkButton href="/setup" className="self-start">
          {t('create.cta')}
        </LinkButton>
      </Card>
      <Card className="flex flex-col gap-3">
        <h2 className="font-display font-semibold">{t('join.title')}</h2>
        <p className="text-sm text-fg-muted">{t('join.body')}</p>
        <JoinCodeForm action={joinWithCodeAction} />
      </Card>
      <form action={logout}>
        <button className="text-sm text-fg-muted hover:text-fg">{t('signOut')}</button>
      </form>
    </AuthShell>
  );
}
