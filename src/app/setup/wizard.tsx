'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Card, Field, Input, Select } from '@/components/ui';
import { ActionForm } from '@/components/ui/form';
import { completeSetup } from './actions';

export function SetupWizard({
  defaults,
  timezones,
}: {
  defaults: {
    currency: string;
    locale: string;
    timezone: string;
    fiscalYearStartMonth: number;
    activeFrom: string;
  };
  timezones: string[];
}) {
  const t = useTranslations('setup');
  const [splitMode, setSplitMode] = useState<'shared' | 'single'>('shared');
  const months = Array.from({ length: 12 }, (_, i) =>
    new Intl.DateTimeFormat(defaults.locale, { month: 'long' }).format(new Date(2026, i, 1)),
  );

  return (
    <ActionForm action={completeSetup} submitLabel={t('submit')}>
      {(errors) => (
        <>
          <Card className="flex flex-col gap-4">
            <h2 className="font-semibold">{t('sections.household')}</h2>
            <Field
              label={t('fields.householdName')}
              error={errors.householdName}
              hint={t('hints.householdName')}
            >
              <Input
                name="householdName"
                placeholder={t('placeholders.householdName')}
                autoFocus
                required
              />
            </Field>
            <fieldset>
              <legend className="mb-1.5 block text-sm font-medium">{t('fields.splitMode')}</legend>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {(['shared', 'single'] as const).map((mode) => (
                  <label
                    key={mode}
                    className={`cursor-pointer rounded-xl border p-3.5 transition ${
                      splitMode === mode
                        ? 'border-accent bg-accent/5'
                        : 'border-border bg-surface-2'
                    }`}
                  >
                    <input
                      type="radio"
                      name="splitMode"
                      value={mode}
                      checked={splitMode === mode}
                      onChange={() => setSplitMode(mode)}
                      className="sr-only"
                    />
                    <span className="block font-semibold">{t(`splitModes.${mode}.label`)}</span>
                    <span className="mt-0.5 block text-xs text-fg-muted">
                      {t(`splitModes.${mode}.body`)}
                    </span>
                  </label>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-fg-muted">{t('hints.splitMode')}</p>
            </fieldset>
          </Card>

          <Card className="flex flex-col gap-4">
            <h2 className="font-semibold">{t('sections.region')}</h2>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('fields.currency')} error={errors.currency}>
                <Input
                  name="currency"
                  defaultValue={defaults.currency}
                  maxLength={3}
                  className="uppercase"
                />
              </Field>
              <Field label={t('fields.locale')} error={errors.locale}>
                <Input name="locale" defaultValue={defaults.locale} />
              </Field>
            </div>
            <Field label={t('fields.timezone')} error={errors.timezone}>
              <Select name="timezone" defaultValue={defaults.timezone}>
                {timezones.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('fields.fiscalYearStartMonth')} hint={t('hints.fiscalYearStartMonth')}>
              <Select
                name="fiscalYearStartMonth"
                defaultValue={String(defaults.fiscalYearStartMonth)}
              >
                {months.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </Select>
            </Field>
          </Card>

          <Card className="flex flex-col gap-4">
            <h2 className="font-semibold">{t('sections.owner')}</h2>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('fields.ownerName')} error={errors.ownerName}>
                <Input name="ownerName" autoComplete="name" required />
              </Field>
              <Field
                label={t('fields.activeFrom')}
                error={errors.activeFrom}
                hint={t('hints.activeFrom')}
              >
                <Input name="activeFrom" type="date" defaultValue={defaults.activeFrom} required />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('fields.pin')} error={errors.pin} hint={t('hints.pin')}>
                <Input
                  name="pin"
                  type="password"
                  inputMode="numeric"
                  pattern="\d{4,8}"
                  autoComplete="new-password"
                  required
                />
              </Field>
              <Field label={t('fields.pinConfirm')} error={errors.pinConfirm}>
                <Input
                  name="pinConfirm"
                  type="password"
                  inputMode="numeric"
                  pattern="\d{4,8}"
                  autoComplete="new-password"
                  required
                />
              </Field>
            </div>
          </Card>
        </>
      )}
    </ActionForm>
  );
}
