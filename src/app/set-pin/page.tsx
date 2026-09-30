import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { AuthShell, AuthSide } from '@/components/app/auth-shell';
import { NewPinForm } from '@/components/app/auth-forms';
import { authState, pathFor } from '@/lib/auth/session';
import { setPinAction } from '../login/actions';

export const dynamic = 'force-dynamic';

export default async function SetPinPage() {
  const state = await authState();
  if (state.kind !== 'needs-pin') redirect(pathFor(state) ?? '/');
  const t = await getTranslations('pin');
  return (
    <AuthShell
      side={
        <AuthSide title={t('setSide', { name: state.member.name })}>{t('setSideBody')}</AuthSide>
      }
    >
      <div className="pin-head">
        <h2>{t('setTitle')}</h2>
        <p className="muted">{t('setBody')}</p>
      </div>
      <NewPinForm action={setPinAction} />
    </AuthShell>
  );
}
