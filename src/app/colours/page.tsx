import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { AuthShell, AuthSide } from '@/components/app/auth-shell';
import { Stepper } from '@/components/app/pieces';
import { ColoursForm } from './colours-form';
import { authState, pathFor } from '@/lib/auth/session';
import { getHousehold } from '@/lib/households';
import { listMembers } from '@/lib/members';
import { saveColoursAction } from './actions';

export const dynamic = 'force-dynamic';

/**
 * Joining by invite: Invite → Sign in → Colours → PIN (§6a). A newcomer who
 * has just accepted picks their colours here, then sets their PIN.
 */
export default async function ColoursPage() {
  const state = await authState();
  if (state.kind !== 'needs-pin') redirect(pathFor(state) ?? '/');
  const t = await getTranslations('join');
  const hh = getHousehold(state.member.householdId);
  const others = listMembers(state.member.householdId)
    .filter((m) => m.id !== state.member.id && m.accountId)
    .map((m) => m.name);
  return (
    <AuthShell
      wide
      side={<AuthSide title={t('side')}>{t('sideBody', { household: hh?.name ?? '' })}</AuthSide>}
    >
      <Stepper
        steps={[t('steps.invite'), t('steps.signIn'), t('steps.colours'), t('steps.pin')]}
        current={3}
      />
      <ColoursForm
        action={saveColoursAction}
        preset={state.member.appearancePreset}
        theme={state.member.theme}
        title={t('colours.title')}
        body={
          others.length
            ? t('colours.body', { names: new Intl.ListFormat('en').format(others) })
            : t('colours.bodyAlone')
        }
        submit={t('colours.continue')}
      />
    </AuthShell>
  );
}
