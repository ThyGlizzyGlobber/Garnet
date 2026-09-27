import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { AuthShell } from '@/components/app/auth-shell';
import { PinForm } from '@/components/app/auth-forms';
import { authState, pathFor } from '@/lib/auth/session';
import { safeNext } from '@/lib/request';
import { logout, rememberNext, unlockAction } from '../login/actions';

export const dynamic = 'force-dynamic';

export default async function UnlockPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = safeNext((await searchParams).next) ?? undefined;
  const state = await authState();
  if (state.kind !== 'locked') redirect(pathFor(state, next) ?? next ?? '/');
  const t = await getTranslations('pin');
  async function unlockWithNext(prev: Parameters<typeof unlockAction>[0], fd: FormData) {
    'use server';
    if (next) await rememberNext(next);
    return unlockAction(prev, fd);
  }
  return (
    <AuthShell title={t('unlockTitle', { name: state.member.name })} subtitle={t('unlockBody')}>
      <PinForm action={unlockWithNext} label={t('pin')} submitLabel={t('unlock')} />
      <form action={logout}>
        <button className="text-sm text-fg-muted hover:text-fg">{t('notYou')}</button>
      </form>
    </AuthShell>
  );
}
