import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { NewPinForm } from '@/components/app/auth-forms';
import { Card, LinkButton } from '@/components/ui';
import { SectionHead } from '@/components/ui/blocks';
import { Avatar } from '@/components/ui/colour';
import { BackLink } from '@/components/ui/controls';
import { InlineAction } from '@/components/ui/form';
import { getAccount } from '@/lib/accounts';
import { avatarUrl } from '@/lib/profile';
import { authState } from '@/lib/auth/session';
import { countDevices } from '@/lib/auth/devices';
import { pageContext } from '@/lib/context';
import { joinStatus, latestInvites } from '@/lib/invites';
import { getMember, isLastAdmin } from '@/lib/members';
import { colourCss } from '@/lib/palette';
import { isAdmin } from '@/lib/roles';
import { defaultRole, roleKey, rolesForType } from '@/lib/household-types';
import {
  changePinAction,
  deleteMemberAction,
  removeAccessAction,
  setMemberRoleAction,
  signOutOtherDevicesAction,
  updateMemberAction,
} from '../../actions';
import { MemberForm } from '../../member-form';

/**
 * One member: their details to edit, and beside them their role, their
 * access (how they sign in, devices, the invite), their own PIN, and
 * removing them. A member's emails and colours live in Settings.
 */
export default async function EditMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { hh, me } = await pageContext();
  const state = await authState();
  const hasPin = state.kind === 'ok' && !!state.account?.pinHash;
  const t = await getTranslations('members');
  const tp = await getTranslations('pin');
  const m = getMember(hh.id, id);
  if (!m) notFound();
  const admin = isAdmin(me);
  const tr = await getTranslations('roles');
  const roles = rolesForType(hh.type)
    .filter((r) => r !== 'owner')
    .map((r) => ({ value: r, label: tr(roleKey(r, hh.type)) }));
  const self = me.id === m.id;
  if (!admin && !self) redirect('/members');
  // A household always keeps one admin: the last one can't step down.
  const lastAdmin = isLastAdmin(hh.id, m);
  const status = joinStatus(m, latestInvites(hh.id).get(m.id));
  const signsIn = m.accountId
    ? `${getAccount(m.accountId)?.googleSub ? t('signsIn.google') : t('signsIn.code')} · ${m.email ?? ''}`
    : status === 'pending'
      ? t('signsIn.invited')
      : t('signsIn.notJoined');
  const side = (
    <>
      {admin && (
        <Card>
          <SectionHead title={t('role.title')} />
          <p className="muted small">
            {isAdmin(m)
              ? lastAdmin
                ? t('role.lastAdmin')
                : t('role.isAdmin', { name: self ? t('role.you') : m.name })
              : t('role.isMember', { name: m.name })}
          </p>
          {isAdmin(m) ? (
            !lastAdmin && (
              <InlineAction
                action={setMemberRoleAction}
                hidden={{ id: m.id, role: defaultRole(hh.type) }}
                label={self ? t('role.stepDown') : t('role.demote')}
                variant="secondary"
                confirm={
                  self ? t('role.stepDownConfirm') : t('role.demoteConfirm', { name: m.name })
                }
              />
            )
          ) : (
            <InlineAction
              action={setMemberRoleAction}
              hidden={{ id: m.id, role: 'owner' }}
              label={t('role.promote')}
              variant="secondary"
              confirm={t('role.promoteConfirm', { name: m.name })}
            />
          )}
        </Card>
      )}
      <Card>
        <SectionHead title={t('access.title')} />
        <p className="muted small">
          {self && m.accountId
            ? t('devices.body', { count: countDevices(m.accountId), email: m.email ?? '' })
            : signsIn}
        </p>
        {self && m.accountId && (
          <InlineAction
            action={signOutOtherDevicesAction}
            label={t('devices.signOutOthers')}
            variant="secondary"
            confirm={t('devices.confirm')}
          />
        )}
        {admin && !self && !m.accountId && (
          <LinkButton href={`/members/${m.id}/invite`} variant="secondary" size="sm" icon="mail">
            {status === 'pending' ? t('resendInvite') : t('invite.cta')}
          </LinkButton>
        )}
        {admin && !self && m.accountId && !isAdmin(m) && (
          <InlineAction
            action={removeAccessAction}
            hidden={{ id: m.id }}
            label={t('removeAccess.cta')}
            variant="secondary"
            confirm={t('removeAccess.confirm', { name: m.name })}
          />
        )}
      </Card>
      {self && hasPin && (
        <Card id="pin">
          <SectionHead title={tp('changeTitle')} />
          <NewPinForm action={changePinAction} withCurrent />
        </Card>
      )}
      {admin && !isAdmin(m) && (
        <Card className="danger">
          <SectionHead title={t('remove.title')} />
          <p className="muted small">{t('remove.body')}</p>
          <InlineAction
            action={deleteMemberAction}
            hidden={{ id: m.id }}
            label={t('remove.cta', { name: m.name })}
            variant="danger"
            confirm={t('deleteConfirm')}
          />
        </Card>
      )}
    </>
  );
  return (
    <div className="scr form-scr">
      <BackLink href="/members">{t('title')}</BackLink>
      <header
        className="member-h glass rounded-card"
        style={{ ['--m' as string]: colourCss(m.colour) }}
      >
        <Avatar
          name={m.name}
          colour={m.colour}
          photo={avatarUrl(m.accountId ? getAccount(m.accountId) : null)}
          size="lg"
        />
        <div>
          <div className="eyebrow">{tr(roleKey(m.role, hh.type))}</div>
          <h1>{m.name}</h1>
          <span className="muted">{signsIn}</span>
        </div>
      </header>
      <MemberForm
        action={updateMemberAction}
        sharedHousehold={hh.splitMode === 'shared'}
        canEditResidency={admin}
        roles={admin && !isAdmin(m) && roles.length > 1 ? roles : []}
        submitLabel={t('form.save')}
        cancelHref="/members"
        side={side}
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
          role: m.role,
        }}
      />
    </div>
  );
}
