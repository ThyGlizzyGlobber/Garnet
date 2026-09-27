import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { NewPinForm } from '@/components/app/auth-forms';
import { Card, PageHeader } from '@/components/ui';
import { InlineAction } from '@/components/ui/form';
import { pageContext } from '@/lib/context';
import { getMember } from '@/lib/members';
import {
  changePinAction,
  deleteMemberAction,
  removeAccessAction,
  updateMemberAction,
} from '../../actions';
import { MemberForm } from '../../member-form';

export default async function EditMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { hh, me } = await pageContext();
  const t = await getTranslations('members');
  const tp = await getTranslations('pin');
  const m = getMember(hh.id, id);
  if (!m) notFound();
  const admin = me.role === 'owner';
  const self = me.id === m.id;
  if (!admin && !self) redirect('/members');
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        title={m.name}
        action={
          admin && m.role !== 'owner' ? (
            <InlineAction
              action={deleteMemberAction}
              hidden={{ id: m.id }}
              label={t('delete')}
              variant="danger"
              confirm={t('deleteConfirm')}
            />
          ) : undefined
        }
      />
      {admin && !self && (
        <Card className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">
            {m.accountId ? `${t('status.joined')} · ${m.email ?? ''}` : t('status.none')}
          </p>
          {m.accountId ? (
            m.role !== 'owner' && (
              <InlineAction
                action={removeAccessAction}
                hidden={{ id: m.id }}
                label={t('removeAccess.cta')}
                variant="danger"
                confirm={t('removeAccess.confirm', { name: m.name })}
              />
            )
          ) : (
            <Link href={`/members/${m.id}/invite`} className="text-sm font-semibold text-accent">
              {t('invite.cta')} →
            </Link>
          )}
        </Card>
      )}
      <MemberForm
        action={updateMemberAction}
        sharedHousehold={hh.splitMode === 'shared'}
        submitLabel={t('form.save')}
        cancelHref="/members"
        initial={{
          id: m.id,
          name: m.name,
          splitWeight: String(m.splitWeight),
          activeFrom: m.activeFrom,
          activeTo: m.activeTo ?? '',
          colour: m.colour,
          paymentDetails: m.paymentDetails,
          email: m.email ?? '',
          joined: !!m.accountId,
        }}
      />
      {self && me.pinHash && (
        <Card className="mt-4 flex flex-col gap-3">
          <h2 className="font-display font-semibold">{tp('changeTitle')}</h2>
          <NewPinForm action={changePinAction} withCurrent />
        </Card>
      )}
    </div>
  );
}
