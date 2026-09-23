import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui';
import { InlineAction } from '@/components/ui/form';
import { pageContext } from '@/lib/context';
import { getMember } from '@/lib/members';
import { deleteMemberAction, updateMemberAction } from '../../actions';
import { MemberForm } from '../../member-form';

export default async function EditMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { hh, me } = await pageContext();
  const t = await getTranslations('members');
  const m = getMember(id);
  if (!m) notFound();
  if (me.role !== 'owner' && me.id !== m.id) redirect('/members');
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        title={m.name}
        action={
          me.role === 'owner' && m.role !== 'owner' ? (
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
        }}
      />
    </div>
  );
}
