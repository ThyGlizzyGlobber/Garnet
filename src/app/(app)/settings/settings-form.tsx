'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Button, Field, Input, Select } from '@/components/ui';
import { Toggle } from '@/components/ui/controls';
import type { ActionState } from '@/components/ui/form';
import { updateSettingsAction } from './actions';
import { ALLOWANCE_PERIODS, HOUSEHOLD_TYPES } from '@/db/schema';
import type { AllowancePeriod, HouseholdType } from '@/lib/household-types';

/** The household's own settings (admins change them; members read them), inside the Household card. */
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
    type: HouseholdType | null;
    address: string | null;
    /** Major units as typed, '' for none. */
    allowance: string;
    allowancePeriod: AllowancePeriod;
    paymentReferenceTemplate: string;
    membersCanExport: boolean;
  };
  timezones: string[];
  months: string[];
  days: string[];
  readOnly: boolean;
}) {
  const t = useTranslations('settings');
  const tt = useTranslations('householdTypes');
  const tp = useTranslations('allowancePeriods');
  const [state, action, pending] = useActionState<ActionState, FormData>(updateSettingsAction, {});
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="mt-2 grid gap-3">
      <fieldset disabled={readOnly} className="contents">
        {state.error && (
          <p
            role="alert"
            className="rounded-inner bg-danger-soft px-4 py-3 text-sm font-medium text-danger"
          >
            {state.error}
          </p>
        )}
        {state.ok && (
          <p
            role="status"
            className="rounded-inner bg-success-soft px-4 py-3 text-sm font-medium text-success"
          >
            {t('saved')}
          </p>
        )}
        <div className="tg-row">
          <span>
            <b>{t('fields.membersCanExport')}</b>
            <span className="muted small">{t('hints.membersCanExportShort')}</span>
          </span>
          <Toggle
            name="membersCanExport"
            label={t('fields.membersCanExport')}
            defaultChecked={initial.membersCanExport}
          />
        </div>
        <details className="group mt-1">
          <summary className="btn btn-plain btn-sm cursor-pointer list-none">
            {readOnly ? t('showDetails') : t('editDetails')}
          </summary>
          <div className="mt-3 grid gap-3">
            <Field label={t('fields.name')} error={e.name}>
              <Input name="name" defaultValue={initial.name} required />
            </Field>
            <Field label={t('fields.type')} hint={t('hints.type')}>
              <Select name="type" defaultValue={initial.type ?? ''}>
                <option value="">{t('householdTypes.none')}</option>
                {HOUSEHOLD_TYPES.map((k) => (
                  <option key={k} value={k}>
                    {tt(`${k}.name`)}
                  </option>
                ))}
              </Select>
            </Field>
            {initial.type === 'investment_property' && (
              <>
                <Field label={t('fields.address')} optional>
                  <Input name="address" defaultValue={initial.address ?? ''} maxLength={120} />
                </Field>
                <div className="fld-row">
                  <Field label={t('fields.allowance')} hint={t('hints.allowance')} optional>
                    <Input
                      name="allowance"
                      inputMode="decimal"
                      defaultValue={initial.allowance}
                      className="narrow"
                    />
                  </Field>
                  <Field label={t('fields.allowancePeriod')}>
                    <Select name="allowancePeriod" defaultValue={initial.allowancePeriod}>
                      {ALLOWANCE_PERIODS.map((k) => (
                        <option key={k} value={k}>
                          {tp(k)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
              </>
            )}
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
          </div>
        </details>
        {!readOnly && (
          <div className="set-acts">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? '…' : t('save')}
            </Button>
          </div>
        )}
      </fieldset>
    </form>
  );
}
