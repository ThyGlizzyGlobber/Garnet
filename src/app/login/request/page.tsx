import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { AuthHead, AuthShell, AuthSide } from '@/components/app/auth-shell';
import { RequestAccessForm } from '@/components/app/auth-forms';
import { authState, pathFor } from '@/lib/auth/session';
import { EMAIL_PATTERN, normaliseEmail } from '@/lib/auth/tokens';
import { requestAccessAction } from '../actions';

export const dynamic = 'force-dynamic';

/**
 * Early access (SCOPE-console.md §3d): an address that can't sign up yet
 * lands here with the plain line, the ways in (an invite), and a short form
 * to ask; after sending, a thanks with nothing else to do.
 */
export default async function RequestAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; sent?: string }>;
}) {
  const { email: raw, sent } = await searchParams;
  const state = await authState();
  if (state.kind !== 'anonymous') redirect(pathFor(state) ?? '/');
  const email = normaliseEmail(raw ?? '');
  if (!EMAIL_PATTERN.test(email)) redirect('/login');
  const t = await getTranslations('login');
  const b = (c: React.ReactNode) => <b>{c}</b>;
  return (
    <AuthShell
      demoLink={false}
      side={<AuthSide title={t('inviteOnly.title')}>{t('subtitle')}</AuthSide>}
    >
      {sent ? (
        <>
          <AuthHead title={t('request.sentTitle', { name: sent })}>
            {t.rich('request.sentBody', { email, b })}
          </AuthHead>
          <p className="muted small t-center">
            <Link href="/login">{t('request.backToSignIn')}</Link>
          </p>
        </>
      ) : (
        <>
          <AuthHead title={t('inviteOnly.title')}>
            {t.rich('inviteOnly.body', { email, b })}
          </AuthHead>
          <RequestAccessForm action={requestAccessAction} email={email} />
          <p className="muted small t-center">
            <Link href="/login">{t('inviteOnly.back')}</Link>
          </p>
        </>
      )}
    </AuthShell>
  );
}
