'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Button, Card, Field, Input, Select } from '@/components/ui';
import type { ActionState } from '@/components/ui/form';
import { updateSettingsAction } from './actions';

export function SettingsForm({
  initial,
  timezones,
  months,
  days,
  readOnly,
}: {
  initial: {
    name: string;
    currency: string;
    locale: string;
    timezone: string;
    fiscalYearStartMonth: number;
    weekStartsOn: number;
    splitMode: 'shared' | 'single';
    paymentReferenceTemplate: string;
    membersCanExport: boolean;
  };
  timezones: string[];
  months: string[];
  days: string[];
  readOnly: boolean;
}) {
  const t = useTranslations('settings');
  const [state, action, pending] = useActionState<ActionState, FormData>(updateSettingsAction, {});
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4">
      <fieldset disabled={readOnly} className="contents">
        {state.error && (
          <p
            role="alert"
            className="rounded-xl bg-danger/10 px-4 py-3 text-sm font-medium text-danger"
          >
            {state.error}
          </p>
        )}
        {state.ok && (
          <p
            role="status"
            className="rounded-xl bg-success/10 px-4 py-3 text-sm font-medium text-success"
          >
            {t('saved')}
          </p>
        )}
        <Card className="flex flex-col gap-4">
          <Field label={t('fields.name')} error={e.name}>
            <Input name="name" defaultValue={initial.name} required />
          </Field>
          <Field label={t('fields.splitMode')} hint={t('hints.splitMode')}>
            <Select name="splitMode" defaultValue={initial.splitMode}>
              <option value="shared">{t('splitModes.shared')}</option>
              <option value="single">{t('splitModes.single')}</option>
            </Select>
          </Field>
          <Field
            label={t('fields.paymentReferenceTemplate')}
            error={e.paymentReferenceTemplate}
            hint={t('hints.paymentReferenceTemplate')}
          >
            <Input
              name="paymentReferenceTemplate"
              defaultValue={initial.paymentReferenceTemplate}
            />
          </Field>
          <label className="flex items-start gap-3 text-sm font-medium">
            <input
              type="checkbox"
              name="membersCanExport"
              defaultChecked={initial.membersCanExport}
              className="mt-0.5 size-5 accent-accent"
            />
            <span>
              {t('fields.membersCanExport')}
              <span className="block text-xs font-normal text-fg-muted">
                {t('hints.membersCanExport')}
              </span>
            </span>
          </label>
        </Card>
        <Card className="flex flex-col gap-4">
          <h2 className="font-semibold">{t('region')}</h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('fields.currency')} error={e.currency}>
              <Input
                name="currency"
                defaultValue={initial.currency}
                maxLength={3}
                className="uppercase"
              />
            </Field>
            <Field label={t('fields.locale')} error={e.locale}>
              <Input name="locale" defaultValue={initial.locale} />
            </Field>
          </div>
          <Field label={t('fields.timezone')} error={e.timezone}>
            <Select name="timezone" defaultValue={initial.timezone}>
              {timezones.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('fields.fiscalYearStartMonth')}>
              <Select
                name="fiscalYearStartMonth"
                defaultValue={String(initial.fiscalYearStartMonth)}
              >
                {months.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('fields.weekStartsOn')}>
              <Select name="weekStartsOn" defaultValue={String(initial.weekStartsOn)}>
                {days.map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </Card>
        {!readOnly && (
          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              {pending ? '…' : t('save')}
            </Button>
          </div>
        )}
      </fieldset>
    </form>
  );
}
