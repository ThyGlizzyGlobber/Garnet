import { getTranslations } from 'next-intl/server';
import { AuthShell, Notice } from '@/components/app/auth-shell';
import { Button } from '@/components/ui';
import { getMemberForSession } from '@/lib/members';
import { getHousehold } from '@/lib/households';
import { verifyUnsubscribe } from '@/lib/notifications';
import { unsubscribeAction } from './actions';

export const dynamic = 'force-dynamic';

/** One-click stop from an email footer. Confirmed with a button so link scanners can't. */
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; c?: string; t?: string; done?: string }>;
}) {
  const { m = '', c = '', t: sig = '', done } = await searchParams;
  const t = await getTranslations('notify.unsubscribe');
  if (done)
    return (
      <AuthShell title={t('title')}>
        <Notice>{t('done')}</Notice>
      </AuthShell>
    );
  const member = verifyUnsubscribe(m, c, sig) ? getMemberForSession(m) : null;
  if (!member)
    return (
      <AuthShell title={t('title')}>
        <Notice tone="danger">{t('invalid')}</Notice>
      </AuthShell>
    );
  const tc = await getTranslations('notify.categories');
  const hh = getHousehold(member.householdId);
  return (
    <AuthShell
      title={t('title')}
      subtitle={t('body', {
        member: member.name,
        category: tc(c as 'bills' | 'reminders' | 'problems'),
        household: hh?.name ?? '',
      })}
    >
      <form action={unsubscribeAction}>
        <input type="hidden" name="m" value={m} />
        <input type="hidden" name="c" value={c} />
        <input type="hidden" name="t" value={sig} />
        <Button type="submit" className="w-full">
          {t('cta')}
        </Button>
      </form>
    </AuthShell>
  );
}
