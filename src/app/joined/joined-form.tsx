'use client';

import { useTranslations } from 'next-intl';
import { Button, Field, Input } from '@/components/ui';
import { ActionForm, type FormAction } from '@/components/ui/form';
import { SwatchPick } from '@/components/app/pieces-client';

/** Name and colour in the household just joined. */
export function JoinedForm({
  action,
  name,
  colour,
}: {
  action: FormAction;
  name: string;
  colour: string;
}) {
  const t = useTranslations('joined');
  return (
    <ActionForm action={action} submitLabel={t('continue')} hideSubmit className="auth-form">
      {(errors, pending) => (
        <>
          <Field label={t('name')} error={errors.name}>
            <Input name="name" defaultValue={name} autoComplete="name" maxLength={40} required />
          </Field>
          <div className="fld">
            <span className="fld-l">{t('colour')}</span>
            <SwatchPick name="colour" value={colour} label={t('colour')} />
          </div>
          <Button type="submit" className="wide" disabled={pending}>
            {pending ? '…' : t('continue')}
          </Button>
        </>
      )}
    </ActionForm>
  );
}
