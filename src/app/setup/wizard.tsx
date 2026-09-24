'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button, Card, Field, Input, Select } from '@/components/ui';
import { ActionForm } from '@/components/ui/form';
import { completeSetup } from './actions';

const STEPS = ['household', 'region', 'owner'] as const;
type Step = (typeof STEPS)[number];
const FIELDS: Record<Step, string[]> = {
  household: ['householdName', 'splitMode'],
  region: ['currency', 'locale', 'timezone', 'fiscalYearStartMonth'],
  owner: ['ownerName', 'activeFrom', 'pin', 'pinConfirm'],
};

/**
 * Three-page wizard in one form: only the active page is visible, Next runs the
 * browser's own validation for that page, and the server's field errors jump
 * back to the page that owns them.
 */
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
  const [step, setStep] = useState<Step>('household');
  const [splitMode, setSplitMode] = useState<'shared' | 'single'>('shared');
  const pages = useRef<Record<Step, HTMLDivElement | null>>({
    household: null,
    region: null,
    owner: null,
  });
  const index = STEPS.indexOf(step);
  const months = Array.from({ length: 12 }, (_, i) =>
    new Intl.DateTimeFormat(defaults.locale, { month: 'long' }).format(new Date(2026, i, 1)),
  );

  function next() {
    const page = pages.current[step];
    const controls = page
      ? Array.from(page.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select'))
      : [];
    for (const c of controls) {
      if (!c.reportValidity()) return;
    }
    setStep(STEPS[Math.min(index + 1, STEPS.length - 1)]!);
  }

  return (
    <ActionForm action={completeSetup} submitLabel={t('submit')} hideSubmit>
      {(errors, pending) => (
        <>
          <JumpToError errors={errors} setStep={setStep} />
          <ol className="mb-5 flex items-center gap-2" aria-label={t('progress')}>
            {STEPS.map((s, i) => (
              <li key={s} className="flex flex-1 items-center gap-2">
                <span
                  className={`grid size-7 place-items-center rounded-full text-xs font-bold ${i <= index ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-fg-muted'}`}
                >
                  {i + 1}
                </span>
                <span
                  className={`text-xs font-semibold ${i === index ? 'text-fg' : 'text-fg-muted'}`}
                >
                  {t(`sections.${s}`)}
                </span>
                {i < STEPS.length - 1 && (
                  <span className={`h-px flex-1 ${i < index ? 'bg-accent' : 'bg-border-strong'}`} />
                )}
              </li>
            ))}
          </ol>

          <div
            ref={(el) => {
              pages.current.household = el;
            }}
            className={step === 'household' ? '' : 'hidden'}
          >
            <Card className="flex flex-col gap-4">
              <h2 className="font-display text-lg font-semibold">{t('sections.household')}</h2>
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
                <legend className="mb-1.5 block text-sm font-medium">
                  {t('fields.splitMode')}
                </legend>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {(['shared', 'single'] as const).map((mode) => (
                    <label
                      key={mode}
                      className={`cursor-pointer rounded-2xl border p-3.5 transition ${splitMode === mode ? 'border-accent bg-accent-soft' : 'border-border-strong bg-surface-2'}`}
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
          </div>

          <div
            ref={(el) => {
              pages.current.region = el;
            }}
            className={step === 'region' ? '' : 'hidden'}
          >
            <Card className="flex flex-col gap-4">
              <h2 className="font-display text-lg font-semibold">{t('sections.region')}</h2>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t('fields.currency')} error={errors.currency}>
                  <Input
                    name="currency"
                    defaultValue={defaults.currency}
                    maxLength={3}
                    minLength={3}
                    pattern="[A-Za-z]{3}"
                    className="uppercase"
                    required
                  />
                </Field>
                <Field label={t('fields.locale')} error={errors.locale}>
                  <Input name="locale" defaultValue={defaults.locale} required />
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
              <Field
                label={t('fields.fiscalYearStartMonth')}
                hint={t('hints.fiscalYearStartMonth')}
              >
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
          </div>

          <div
            ref={(el) => {
              pages.current.owner = el;
            }}
            className={step === 'owner' ? '' : 'hidden'}
          >
            <Card className="flex flex-col gap-4">
              <h2 className="font-display text-lg font-semibold">{t('sections.owner')}</h2>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t('fields.ownerName')} error={errors.ownerName}>
                  <Input name="ownerName" autoComplete="name" required />
                </Field>
                <Field
                  label={t('fields.activeFrom')}
                  error={errors.activeFrom}
                  hint={t('hints.activeFrom')}
                >
                  <Input
                    name="activeFrom"
                    type="date"
                    defaultValue={defaults.activeFrom}
                    required
                  />
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
          </div>

          <div className="mt-2 flex items-center justify-between gap-3">
            {index > 0 ? (
              <Button type="button" variant="secondary" onClick={() => setStep(STEPS[index - 1]!)}>
                {t('back')}
              </Button>
            ) : (
              <span />
            )}
            {index < STEPS.length - 1 ? (
              <Button type="button" onClick={next}>
                {t('next')}
              </Button>
            ) : (
              <Button type="submit" disabled={pending}>
                {pending ? '…' : t('submit')}
              </Button>
            )}
          </div>
        </>
      )}
    </ActionForm>
  );
}

/** When the server rejects a field, show the page that owns it. */
function JumpToError({
  errors,
  setStep,
}: {
  errors: Record<string, string>;
  setStep: (s: Step) => void;
}) {
  const keys = Object.keys(errors).join(',');
  useEffect(() => {
    if (!keys) return;
    const first = STEPS.find((s) => FIELDS[s].some((f) => keys.split(',').includes(f)));
    if (first) setStep(first);
  }, [keys, setStep]);
  return null;
}
