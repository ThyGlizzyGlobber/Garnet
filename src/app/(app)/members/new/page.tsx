import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { PageTitle } from '@/components/ui/blocks';
import { BackLink } from '@/components/ui/controls';
import { pageContext } from '@/lib/context';
import { listMembers } from '@/lib/members';
import { nextPaletteColour } from '@/lib/palette';
import { isAdmin } from '@/lib/roles';
import { defaultRole, roleKey, rolesForType } from '@/lib/household-types';
import { createMemberAction } from '../actions';
import { MemberForm } from '../member-form';

/** Admins: add someone (with their email, an invite goes out); they pick their own colours and PIN when they join. */
export default async function NewMemberPage() {
  const { hh, me, today } = await pageContext();
  if (!isAdmin(me)) redirect('/members');
  const t = await getTranslations('members');
  const tr = await getTranslations('roles');
  const roles = rolesForType(hh.type)
    .filter((r) => r !== 'owner')
    .map((r) => ({ value: r, label: tr(roleKey(r, hh.type)) }));
  return (
    <div className="scr form-scr narrow">
      <BackLink href="/members">{t('title')}</BackLink>
      <PageTitle title={t('inviteSomeone')} lede={t('newLede')} />
      <MemberForm
        action={createMemberAction}
        sharedHousehold={hh.splitMode === 'shared'}
        roles={roles.length > 1 ? roles : []}
        submitLabel={t('form.create')}
        cancelHref="/members"
        initial={{
          name: '',
          splitWeight: '1',
          activeFrom: today,
          activeTo: '',
          colour: nextPaletteColour(listMembers(hh.id).map((m) => m.colour)),
          paymentDetails: [],
          email: '',
          joined: false,
          role: defaultRole(hh.type),
        }}
      />
    </div>
  );
}
