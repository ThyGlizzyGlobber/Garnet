'use client';

import { useTranslations } from 'next-intl';
import { Button, Field, Input, Select } from '@/components/ui';
import { ActionForm, type FormAction } from '@/components/ui/form';

/**
 * "Change amount" for a recurring charge (owner: providers change the regular
 * amount): the new amount and the charge it starts from, picked from the next
 * few; or, before any bill, what the first charge costs and when it falls.
 */
export function ChargeAmount({
  action,
  serviceId,
  currency,
  amount,
  starts,
  firstOn,
}: {
  action: FormAction;
  serviceId: string;
  currency: string;
  /** The current amount, as the field expects it ("24.99"), or blank. */
  amount: string;
  /** The next charges to start from (value = ISO date), when bills are in. */
  starts: { value: string; label: string }[];
  /** With no bill yet: the first charge's day so far, or blank. */
  firstOn: string;
}) {
  const t = useTranslations('services.recurring.amount');
  return (
    <details className="wiz-more mt-3">
      <summary className="link small">{t('open')}</summary>
      <ActionForm action={action} submitLabel={t('save')} hideSubmit className="mt-3 grid gap-3">
        {(errors, pending) => (
          <>
            <input type="hidden" name="id" value={serviceId} />
            <Field label={t('amount', { currency })} error={errors.amount}>
              <Input name="amount" inputMode="decimal" defaultValue={amount} required />
            </Field>
            {starts.length > 0 ? (
              <Field label={t('from')} hint={t('fromHint')} error={errors.from}>
                <Select name="from" defaultValue={starts[0]!.value}>
                  {starts.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : (
              <Field label={t('firstOn')} error={errors.from}>
                <Input name="from" type="date" defaultValue={firstOn} required />
              </Field>
            )}
            <div className="form-acts">
              <Button type="submit" variant="secondary" disabled={pending}>
                {pending ? '…' : t('save')}
              </Button>
            </div>
          </>
        )}
      </ActionForm>
    </details>
  );
}
