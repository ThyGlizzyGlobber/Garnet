import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Notice } from '@/components/app/auth-shell';
import { Or } from '@/components/app/pieces';
import { Card } from '@/components/ui';
import { PageTitle } from '@/components/ui/blocks';
import { BackLink } from '@/components/ui/controls';
import { CopyButton } from '@/components/ui/copy';
import { getSession } from '@/lib/auth/session';
import { pageContext } from '@/lib/context';
import { getMember } from '@/lib/members';
import { isAdmin } from '@/lib/roles';
import { inviteMemberAction } from '../../actions';
import { InviteForm } from './invite-form';

/** Admin: send an invitation, and show a just-created link and code once. */
export default async function InviteMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { hh, me } = await pageContext();
  if (!isAdmin(me)) redirect('/members');
  const m = getMember(hh.id, id);
  if (!m) notFound();
  const t = await getTranslations('members.invite');
  const tm = await getTranslations('members');
  const flash = (await getSession()).flashInvite;
  const fresh = flash?.memberId === m.id ? flash : null;
  return (
    <div className="scr form-scr narrow">
      <BackLink href="/members">{tm('title')}</BackLink>
      <PageTitle title={t('title', { name: m.name })} lede={t('lede')} />
      <Card className="form-main">
        {m.accountId ? (
          <Notice>{t('joined', { name: m.name })}</Notice>
        ) : (
          <>
            {fresh?.emailed && <Notice>{t('emailed', { email: fresh.emailed })}</Notice>}
            {fresh?.emailError && (
              <Notice tone="danger">{t('emailFailed', { reason: fresh.emailError })}</Notice>
            )}
            <InviteForm
              action={inviteMemberAction}
              memberId={m.id}
              email={m.email ?? ''}
              submitLabel={fresh ? t('sendNew') : t('send')}
            />
            <Or>{t('orShare')}</Or>
            {fresh ? (
              <>
                <div className="code-share">
                  <span className="code-big mono well">{fresh.code}</span>
                  <CopyButton value={fresh.code} label={t('copyCode')} />
                  <CopyButton
                    value={fresh.link}
                    label={t('copyLink')}
                    className="btn btn-plain btn-sm"
                  />
                </div>
                <p className="muted small">{t('codeNote')}</p>
              </>
            ) : (
              <p className="muted small">{t('notShown')}</p>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
