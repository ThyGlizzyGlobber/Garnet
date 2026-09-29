import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { NewPinForm } from '@/components/app/auth-forms';
import { Card, PageHeader } from '@/components/ui';
import { InlineAction } from '@/components/ui/form';
import { pageContext } from '@/lib/context';
import { getMember, isLastAdmin } from '@/lib/members';
import {
  changePinAction,
  deleteMemberAction,
  removeAccessAction,
  setMemberRoleAction,
  saveNotifyPrefsAction,
  signOutOtherDevicesAction,
  updateMemberAction,
} from '../../actions';
import { NotifyForm } from '../../notify-form';
import { countDevices } from '@/lib/auth/devices';
import { authState } from '@/lib/auth/session';
import { MemberForm } from '../../member-form';
import { isAdmin } from '@/lib/roles';

export default async function EditMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { hh, me } = await pageContext();
  const t = await getTranslations('members');
  const tp = await getTranslations('pin');
  const m = getMember(hh.id, id);
  if (!m) notFound();
  const admin = isAdmin(me);
  const state = await authState();
  const account = state.kind === 'ok' ? state.account : null;
  const tn = await getTranslations('notify.prefs');
  const self = me.id === m.id;
  if (!admin && !self) redirect('/members');
  // A household always keeps one admin: the last one can't step down.
  const lastAdmin = isLastAdmin(hh.id, m);
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        title={m.name}
        action={
          admin && !isAdmin(m) ? (
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
            !isAdmin(m) && (
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
      {admin && (
        <Card className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display font-semibold">{t('role.title')}</h2>
            <p className="text-xs text-fg-muted">
              {isAdmin(m)
                ? lastAdmin
                  ? t('role.lastAdmin')
                  : t('role.isAdmin', { name: self ? t('role.you') : m.name })
                : t('role.isMember', { name: m.name })}
            </p>
          </div>
          {isAdmin(m) ? (
            !lastAdmin && (
              <InlineAction
                action={setMemberRoleAction}
                hidden={{ id: m.id, role: 'member' }}
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
              confirm={t('role.promoteConfirm', { name: m.name })}
            />
          )}
        </Card>
      )}
      <MemberForm
        action={updateMemberAction}
        sharedHousehold={hh.splitMode === 'shared'}
        canEditResidency={admin}
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
      {self && (
        <Card className="mt-4 flex flex-col gap-3">
          <h2 className="font-display font-semibold">{tn('title')}</h2>
          {account ? (
            <NotifyForm
              action={saveNotifyPrefsAction}
              initial={{
                bills: me.notifyBills,
                reminders: me.notifyReminders,
                problems: me.notifyProblems,
              }}
            />
          ) : (
            <p className="text-sm text-fg-muted">{tn('noEmail')}</p>
          )}
        </Card>
      )}
      {self && account && (
        <Card className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display font-semibold">{t('devices.title')}</h2>
            <p className="text-xs text-fg-muted">
              {t('devices.body', { count: countDevices(account.id), email: account.email })}
            </p>
          </div>
          <InlineAction
            action={signOutOtherDevicesAction}
            label={t('devices.signOutOthers')}
            variant="secondary"
            confirm={t('devices.confirm')}
          />
        </Card>
      )}
      {self && me.pinHash && (
        <Card className="mt-4 flex flex-col gap-3">
          <h2 className="font-display font-semibold">{tp('changeTitle')}</h2>
          <NewPinForm action={changePinAction} withCurrent />
        </Card>
      )}
    </div>
  );
}
