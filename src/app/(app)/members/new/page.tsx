import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui';
import { pageContext } from '@/lib/context';
import { createMemberAction } from '../actions';
import { listMembers } from '@/lib/members';
import { nextPaletteColour } from '@/lib/palette';
import { MemberForm } from '../member-form';

export default async function NewMemberPage() {
  const { hh, today } = await pageContext();
  const t = await getTranslations('members');
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title={t('new')} />
      <MemberForm
        action={createMemberAction}
        sharedHousehold={hh.splitMode === 'shared'}
        submitLabel={t('form.create')}
        cancelHref="/members"
        initial={{
          name: '',
          splitWeight: '1',
          activeFrom: today,
          activeTo: '',
          colour: nextPaletteColour(listMembers().map((m) => m.colour)),
          paymentDetails: [],
        }}
      />
    </div>
  );
}
