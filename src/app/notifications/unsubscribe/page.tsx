import { getTranslations } from 'next-intl/server';
import { AuthShell, AuthSide, Notice } from '@/components/app/auth-shell';
import { Icon } from '@/components/app/icons';
import { Button, LinkButton } from '@/components/ui';
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
  const side = <AuthSide title={t('side')}>{t('sideBody')}</AuthSide>;
  const bell = (
    <span className="empty-ic">
      <Icon name="bell" width={24} height={24} />
    </span>
  );
  if (done)
    return (
      <AuthShell side={side}>
        <div className="pin-head">
          {bell}
          <h2>{t('doneTitle')}</h2>
          <p className="muted">{t('done')}</p>
        </div>
        <LinkButton href="/settings#emails" variant="ghost" className="wide">
          {t('change')}
        </LinkButton>
      </AuthShell>
    );
  const member = verifyUnsubscribe(m, c, sig) ? getMemberForSession(m) : null;
  if (!member)
    return (
      <AuthShell side={side}>
        <div className="pin-head">
          {bell}
          <h2>{t('title')}</h2>
        </div>
        <Notice tone="danger">{t('invalid')}</Notice>
      </AuthShell>
    );
  const tc = await getTranslations('notify.categories');
  const hh = getHousehold(member.householdId);
  return (
    <AuthShell side={side}>
      <div className="pin-head">
        {bell}
        <h2>{t('title')}</h2>
        <p className="muted">
          {t('body', {
            member: member.name,
            category: tc(c as 'bills' | 'reminders' | 'problems'),
            household: hh?.name ?? '',
          })}
        </p>
      </div>
      <form action={unsubscribeAction} className="auth-form">
        <input type="hidden" name="m" value={m} />
        <input type="hidden" name="c" value={c} />
        <input type="hidden" name="t" value={sig} />
        <Button type="submit" className="wide">
          {t('cta')}
        </Button>
      </form>
      <LinkButton href="/settings#emails" variant="ghost" className="wide">
        {t('change')}
      </LinkButton>
    </AuthShell>
  );
}
