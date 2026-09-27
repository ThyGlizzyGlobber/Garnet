import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { AuthShell } from '@/components/app/auth-shell';
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
    <AuthShell title={t('title')} subtitle={t('body', { email: session.pendingEmail })}>
      <CodeForm action={verifyCodeAction} />
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <form action={resendCodeAction}>
          <button className="font-semibold text-accent">{t('resend')}</button>
        </form>
        <Link href="/login" className="text-fg-muted hover:text-fg">
          {t('otherEmail')}
        </Link>
      </div>
    </AuthShell>
  );
}
