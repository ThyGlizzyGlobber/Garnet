'use client';

import { useTranslations } from 'next-intl';
import { Card, Field, Input } from '@/components/ui';
import { ActionForm, type FormAction } from '@/components/ui/form';

export interface MemberFormValues {
  id?: string;
  name: string;
  splitWeight: string;
  activeFrom: string;
  activeTo: string;
  colour: string;
  paymentDetails: { label: string; value: string }[];
  email: string;
  /** Joined members sign in with their account; their email isn't edited here. */
  joined: boolean;
}

export function MemberForm({
  action,
  initial,
  sharedHousehold,
  submitLabel,
  cancelHref,
}: {
  action: FormAction;
  initial: MemberFormValues;
  sharedHousehold: boolean;
  submitLabel: string;
  cancelHref: string;
}) {
  const t = useTranslations('members.form');
  const rows = [...initial.paymentDetails, { label: '', value: '' }].slice(0, 6);
  return (
    <ActionForm
      action={action}
      submitLabel={submitLabel}
      footer={
        <a href={cancelHref} className="text-sm font-medium text-fg-muted hover:text-fg">
          {t('cancel')}
        </a>
      }
    >
      {(errors) => (
        <>
          {initial.id && <input type="hidden" name="id" value={initial.id} />}
          <Card className="flex flex-col gap-4">
            <div className="grid grid-cols-[1fr_auto] gap-3">
              <Field label={t('name')} error={errors.name}>
                <Input name="name" defaultValue={initial.name} autoComplete="off" required />
              </Field>
              <Field label={t('colour')}>
                <Input
                  name="colour"
                  type="color"
                  defaultValue={initial.colour}
                  className="h-11 w-16 p-1"
                />
              </Field>
            </div>
            {!initial.joined && (
              <Field label={t('email')} error={errors.email} hint={t('emailHint')}>
                <Input
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  defaultValue={initial.email}
                />
              </Field>
            )}
          </Card>
          <Card className="flex flex-col gap-4">
            <h2 className="font-semibold">{t('residency')}</h2>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('activeFrom')} error={errors.activeFrom} hint={t('activeFromHint')}>
                <Input name="activeFrom" type="date" defaultValue={initial.activeFrom} required />
              </Field>
              <Field label={t('activeTo')} error={errors.activeTo} hint={t('activeToHint')}>
                <Input name="activeTo" type="date" defaultValue={initial.activeTo} />
              </Field>
            </div>
            {sharedHousehold && (
              <Field
                label={t('splitWeight')}
                error={errors.splitWeight}
                hint={t('splitWeightHint')}
              >
                <Input name="splitWeight" inputMode="decimal" defaultValue={initial.splitWeight} />
              </Field>
            )}
            {!sharedHousehold && (
              <input type="hidden" name="splitWeight" value={initial.splitWeight} />
            )}
          </Card>
          {sharedHousehold && (
            <Card className="flex flex-col gap-3">
              <h2 className="font-semibold">{t('paymentDetails')}</h2>
              <p className="text-xs text-fg-muted">{t('paymentDetailsHint')}</p>
              {rows.map((r, i) => (
                <div key={i} className="grid grid-cols-[1fr_2fr] gap-2">
                  <Input name={`pd_label_${i}`} defaultValue={r.label} placeholder={t('pdLabel')} />
                  <Input name={`pd_value_${i}`} defaultValue={r.value} placeholder={t('pdValue')} />
                </div>
              ))}
            </Card>
          )}
        </>
      )}
    </ActionForm>
  );
}
