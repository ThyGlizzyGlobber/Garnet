import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { AuthShell, AuthSide } from '@/components/app/auth-shell';
import { PinForm } from '@/components/app/auth-forms';
import { Avatar } from '@/components/ui/colour';
import { DEFAULT_COLOUR } from '@/lib/palette';
import { authState, pathFor } from '@/lib/auth/session';
import { accountGivenName } from '@/lib/accounts';
import { getHousehold } from '@/lib/households';
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
  const hh = state.member ? getHousehold(state.member.householdId) : null;
  const name = state.member?.name ?? accountGivenName(state.account);
  const colour = state.member?.colour ?? DEFAULT_COLOUR;
  async function unlockWithNext(prev: Parameters<typeof unlockAction>[0], fd: FormData) {
    'use server';
    if (next) await rememberNext(next);
    return unlockAction(prev, fd);
  }
  return (
    <AuthShell
      side={
        <AuthSide title={hh ? t('unlockSide', { household: hh.name }) : t('unlockSideNoHousehold')}>
          {t('unlockSideBody')}
        </AuthSide>
      }
    >
      <div className="pin-head">
        <Avatar name={name ?? state.account.email} colour={colour} size="lg" />
        <h2>{name ? t('unlockTitle', { name }) : t('unlockTitleNoName')}</h2>
        <p className="muted">{t('unlockBody')}</p>
      </div>
      <PinForm action={unlockWithNext} label={t('pin')} submitLabel={t('unlock')} />
      <div className="muted small t-center">
        {t('forgot')}{' '}
        <form action={logout} className="inline-form">
          <button className="link">{t('signInAgain')}</button>
        </form>
        {' · '}
        <form action={logout} className="inline-form">
          <button className="link">{name ? t('notYou', { name }) : t('notYouNoName')}</button>
        </form>
      </div>
    </AuthShell>
  );
}
