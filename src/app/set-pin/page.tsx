import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { AuthShell } from '@/components/app/auth-shell';
import { NewPinForm } from '@/components/app/auth-forms';
import { authState, pathFor } from '@/lib/auth/session';
import { setPinAction } from '../login/actions';

export const dynamic = 'force-dynamic';

export default async function SetPinPage() {
  const state = await authState();
  if (state.kind !== 'needs-pin') redirect(pathFor(state) ?? '/');
  const t = await getTranslations('pin');
  return (
    <AuthShell eyebrow={state.member.name} title={t('setTitle')} subtitle={t('setBody')}>
      <NewPinForm action={setPinAction} />
    </AuthShell>
  );
}
