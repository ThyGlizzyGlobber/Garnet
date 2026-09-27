'use client';

import { useTranslations } from 'next-intl';
import { Field, Input } from '@/components/ui';
import { ActionForm, type FormAction } from '@/components/ui/form';

export function InviteForm({
  action,
  memberId,
  email,
  submitLabel,
}: {
  action: FormAction;
  memberId: string;
  email: string;
  submitLabel: string;
}) {
  const t = useTranslations('members.invite');
  return (
    <ActionForm action={action} submitLabel={submitLabel}>
      {(errors) => (
        <>
          <input type="hidden" name="id" value={memberId} />
          <Field label={t('email')} hint={t('emailHint')} error={errors.email}>
            <Input name="email" type="email" inputMode="email" defaultValue={email} />
          </Field>
        </>
      )}
    </ActionForm>
  );
}
