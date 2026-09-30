import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { AuthHead, AuthShell } from '@/components/app/auth-shell';
import { CodeForm } from '@/components/app/auth-forms';
import { authState, getSession, pathFor } from '@/lib/auth/session';
import { resendCodeAction, verifyCodeAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function CodePage() {
  const state = await authState();
  if (state.kind !== 'anonymous') redirect(pathFor(state) ?? '/');
  const session = await getSession();
  if (!session.pendingEmail) redirect('/login');
  const t = await getTranslations('code');
  return (
    <AuthShell>
      <AuthHead title={t('title')}>
        {t.rich('body', { email: session.pendingEmail, b: (c) => <b>{c}</b> })}
      </AuthHead>
      <CodeForm action={verifyCodeAction} />
      <div className="muted small">
        {t('notGot')}{' '}
        <form action={resendCodeAction} className="inline-form">
          <button className="link">{t('resend')}</button>
        </form>
        {' · '}
        <Link href="/login">{t('otherEmail')}</Link>
      </div>
    </AuthShell>
  );
}
