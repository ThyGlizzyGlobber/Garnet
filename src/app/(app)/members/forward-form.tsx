'use client';

import { useTranslations } from 'next-intl';
import { Field, Input, Select } from '@/components/ui';
import { ActionForm, type FormAction } from '@/components/ui/form';

export function ForwardForm({
  action,
  email,
  mode,
}: {
  action: FormAction;
  email: string;
  mode: 'off' | 'all' | 'non_bills';
}) {
  const t = useTranslations('forward');
  return (
    <ActionForm action={action} submitLabel={t('save')}>
      {(errors) => (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('mode')}>
            <Select name="mode" defaultValue={mode}>
              {(['all', 'non_bills', 'off'] as const).map((m) => (
                <option key={m} value={m}>
                  {t(`modes.${m}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('email')} hint={t('emailHint')} error={errors.email}>
            <Input name="email" type="email" inputMode="email" defaultValue={email} required />
          </Field>
        </div>
      )}
    </ActionForm>
  );
}
