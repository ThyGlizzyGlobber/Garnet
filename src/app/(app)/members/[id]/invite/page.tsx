import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Notice } from '@/components/app/auth-shell';
import { CopyField } from '@/components/app/auth-forms';
import { Card, PageHeader } from '@/components/ui';
import { getSession } from '@/lib/auth/session';
import { pageContext } from '@/lib/context';
import { getMember } from '@/lib/members';
import { inviteMemberAction } from '../../actions';
import { InviteForm } from './invite-form';

/** Admin: send an invitation, and show a just-created link and code once. */
export default async function InviteMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { hh, me } = await pageContext();
  if (me.role !== 'owner') redirect('/members');
  const m = getMember(hh.id, id);
  if (!m) notFound();
  const t = await getTranslations('members.invite');
  const flash = (await getSession()).flashInvite;
  const fresh = flash?.memberId === m.id ? flash : null;
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <PageHeader title={t('title', { name: m.name })} subtitle={t('body', { name: m.name })} />
      {m.accountId ? (
        <Notice>{t('joined', { name: m.name })}</Notice>
      ) : (
        <>
          {fresh && (
            <Card className="flex flex-col gap-4">
              {fresh.emailed && <Notice>{t('emailed', { email: fresh.emailed })}</Notice>}
              {fresh.emailError && (
                <Notice tone="danger">{t('emailFailed', { reason: fresh.emailError })}</Notice>
              )}
              <CopyField label={t('link')} value={fresh.link} />
              <CopyField label={t('code')} value={fresh.code} mono />
            </Card>
          )}
          {!fresh && <p className="text-sm text-fg-muted">{t('notShown')}</p>}
          <Card>
            <InviteForm
              action={inviteMemberAction}
              memberId={m.id}
              email={m.email ?? ''}
              submitLabel={fresh ? t('sendNew') : t('send')}
            />
          </Card>
        </>
      )}
      <Link href="/members" className="text-sm text-fg-muted hover:text-fg">
        ← {(await getTranslations('members'))('title')}
      </Link>
    </div>
  );
}
