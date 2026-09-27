import { getTranslations } from 'next-intl/server';
import { AuthShell, Notice } from '@/components/app/auth-shell';
import { Button } from '@/components/ui';
import { pendingForwardByToken } from '@/lib/forwarding';
import { getHousehold } from '@/lib/households';
import { confirmForwardAction } from './actions';

export const dynamic = 'force-dynamic';

/**
 * Confirmation for forwarding to an address other than the member's sign-in
 * email. A button (not the page load) confirms, so mail scanners that open
 * links can't switch it on by themselves.
 */
export default async function ConfirmForwardPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const token = decodeURIComponent((await params).token);
  const t = await getTranslations('forward.confirmPage');
  if (token === 'done')
    return (
      <AuthShell title={t('title')}>
        <Notice>{t('done')}</Notice>
      </AuthShell>
    );
  const row = pendingForwardByToken(token);
  if (!row)
    return (
      <AuthShell title={t('title')}>
        <Notice tone="danger">{t('invalid')}</Notice>
      </AuthShell>
    );
  const hh = getHousehold(row.householdId);
  return (
    <AuthShell
      title={t('title')}
      subtitle={t('body', { household: hh?.name ?? '', email: row.email })}
    >
      <form action={confirmForwardAction}>
        <input type="hidden" name="token" value={token} />
        <Button type="submit" className="w-full">
          {t('cta')}
        </Button>
      </form>
    </AuthShell>
  );
}
