import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { AuthShell, Notice } from '@/components/app/auth-shell';
import { DemoForm, EmailForm } from '@/components/app/auth-forms';
import { authState, getSession, pathFor } from '@/lib/auth/session';
import { isGoogleConfigured } from '@/lib/env';
import { listHouseholds } from '@/lib/households';
import { findInviteByToken } from '@/lib/invites';
import { listMembers } from '@/lib/members';
import { safeNext } from '@/lib/request';
import { demoLoginAction, sendCodeAction } from './actions';

export const dynamic = 'force-dynamic';

const REASONS: Record<string, string> = {
  google: 'google',
  'google-off': 'googleOff',
  'locked-out': 'lockedOut',
  'rate-limited': 'tooMany',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reason?: string }>;
}) {
  const { next: rawNext, reason } = await searchParams;
  const next = safeNext(rawNext) ?? undefined;
  const state = await authState();
  if (state.kind !== 'anonymous') redirect(pathFor(state, next) ?? next ?? '/');
  const t = await getTranslations('login');
  const session = await getSession();
  const invite = session.pendingInvite ? findInviteByToken(session.pendingInvite) : null;
  const demo = listHouseholds().find((h) => h.isDemo);
  const google = isGoogleConfigured();
  const googleHref = `/api/auth/google/start${next ? `?next=${encodeURIComponent(next)}` : ''}`;
  return (
    <AuthShell
      eyebrow={invite ? t('inviteContext', { household: invite.household.name }) : undefined}
      title={t('title')}
      subtitle={t('subtitle')}
    >
      {reason && REASONS[reason] && <Notice tone="danger">{t(`errors.${REASONS[reason]}`)}</Notice>}
      {google && (
        <>
          <a
            href={googleHref}
            className="glass flex items-center justify-center gap-3 rounded-full px-4 py-3 text-sm font-semibold hover:bg-surface-2"
          >
            <GoogleMark />
            {t('google')}
          </a>
          <div className="flex items-center gap-3 text-xs text-fg-muted">
            <span className="h-px flex-1 bg-border-strong" />
            {t('or')}
            <span className="h-px flex-1 bg-border-strong" />
          </div>
        </>
      )}
      <EmailForm action={sendCodeAction} next={next ?? ''} />
      {demo && (
        <details className="rounded-2xl bg-surface-2 p-4">
          <summary className="cursor-pointer text-sm font-semibold">{t('demo.title')}</summary>
          <p className="mt-2 mb-4 text-xs text-fg-muted">{t('demo.body')}</p>
          <DemoForm
            action={demoLoginAction}
            members={listMembers(demo.id).map((m) => ({ id: m.id, name: m.name }))}
          />
        </details>
      )}
    </AuthShell>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.7z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9h-4v3.1A12 12 0 0 0 12 24z"
      />
      <path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.7V6.6h-4a12 12 0 0 0 0 10.9z" />
      <path
        fill="#EA4335"
        d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8z"
      />
    </svg>
  );
}
