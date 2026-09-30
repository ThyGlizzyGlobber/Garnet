'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button, Field, Input, Select } from '@/components/ui';
import { Segmented } from '@/components/ui/controls';
import { ActionForm } from '@/components/ui/form';
import { LocationField } from '@/components/app/location-field';
import { Stepper } from '@/components/app/pieces';
import { SwatchPick } from '@/components/app/pieces-client';
import { PresetCards } from '@/components/app/preset-cards';
import { DEFAULT_APPEARANCE, type Theme } from '@/lib/appearance';
import { PALETTE } from '@/lib/palette';
import { completeSetup } from './actions';

const STEPS = ['household', 'where', 'you', 'colours'] as const;
type Step = (typeof STEPS)[number];
const FIELDS: Record<Step, string[]> = {
  household: ['householdName', 'splitMode'],
  where: ['currency', 'locale', 'timezone', 'fiscalYearStartMonth', 'country', 'postalCode'],
  you: ['ownerName', 'activeFrom', 'colour'],
  colours: ['preset', 'theme'],
};

/**
 * The setup wizard (§6a): Household → Where → You → Colours, one form with
 * only the current step visible. Continue runs the browser's own validation
 * for that step, and the server's field errors jump back to the step that
 * owns them. The PIN comes after, on its own screen.
 */
export function SetupWizard({
  defaults,
  timezones,
  withData,
  country,
}: {
  defaults: {
    currency: string;
    locale: string;
    timezone: string;
    fiscalYearStartMonth: number;
    activeFrom: string;
    ownerName: string;
  };
  timezones: string[];
  /** Countries with postcode data, for the location field. */
  withData: string[];
  /** Default country (from the default locale). */
  country: string;
}) {
  const t = useTranslations('setup');
  const ta = useTranslations('appearance');
  const tShare = useTranslations('sharing');
  const [step, setStep] = useState<Step>('household');
  const [splitMode, setSplitMode] = useState<'shared' | 'single'>('shared');
  const [region, setRegion] = useState({
    currency: defaults.currency,
    timezone: defaults.timezone,
    fy: defaults.fiscalYearStartMonth,
  });
  const [theme, setTheme] = useState<Theme>(DEFAULT_APPEARANCE.theme);
  const pages = useRef<Partial<Record<Step, HTMLDivElement | null>>>({});
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
  const page = (s: Step) => ({
    ref: (el: HTMLDivElement | null) => {
      pages.current[s] = el;
    },
    className: step === s ? 'wiz-body' : 'wiz-body hidden',
  });

  return (
    <ActionForm action={completeSetup} submitLabel={t('submit')} hideSubmit className="wiz">
      {(errors, pending) => (
        <>
          <JumpToError errors={errors} setStep={setStep} />
          <Stepper
            steps={STEPS.map((s) => t(`steps.${s}`))}
            current={index + 1}
            onPick={(n) => setStep(STEPS[n - 1]!)}
          />

          <div {...page('household')}>
            <h2>{t('household.title')}</h2>
            <p className="muted">{t('household.body')}</p>
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
            <fieldset className="fld">
              <legend className="fld-l">{t('fields.splitMode')}</legend>
              <div className="radio-cards">
                {(['shared', 'single'] as const).map((mode) => (
                  <label key={mode} className={splitMode === mode ? 'rcard on' : 'rcard'}>
                    <input
                      type="radio"
                      name="splitMode"
                      value={mode}
                      checked={splitMode === mode}
                      onChange={() => setSplitMode(mode)}
                    />
                    <b>{t(`splitModes.${mode}.label`)}</b>
                    <span className="muted small">{t(`splitModes.${mode}.body`)}</span>
                  </label>
                ))}
              </div>
              <span className="fld-h">{t('hints.splitMode')}</span>
            </fieldset>
          </div>

          <div {...page('where')}>
            <h2>{t('where.title')}</h2>
            <p className="muted">{t('where.body')}</p>
            <LocationField
              withData={withData}
              initial={{ country, postalCode: '', locality: '' }}
              errors={errors}
              optional
            />
            <details className="wiz-more">
              <summary className="muted small">
                {t('where.summary', {
                  month: months[region.fy - 1] ?? '',
                  currency: region.currency,
                  timezone: region.timezone.replace(/_/g, ' '),
                })}{' '}
                <span className="link">{t('where.change')}</span>
              </summary>
              <div className="fld-row">
                <Field label={t('fields.currency')} error={errors.currency}>
                  <Input
                    name="currency"
                    defaultValue={defaults.currency}
                    maxLength={3}
                    minLength={3}
                    pattern="[A-Za-z]{3}"
                    className="uppercase"
                    onChange={(e) =>
                      setRegion((r) => ({ ...r, currency: e.target.value.toUpperCase() }))
                    }
                    required
                  />
                </Field>
                <Field label={t('fields.locale')} error={errors.locale}>
                  <Input name="locale" defaultValue={defaults.locale} required />
                </Field>
              </div>
              <Field label={t('fields.timezone')} error={errors.timezone}>
                <Select
                  name="timezone"
                  defaultValue={defaults.timezone}
                  onChange={(e) => setRegion((r) => ({ ...r, timezone: e.target.value }))}
                >
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
                  onChange={(e) => setRegion((r) => ({ ...r, fy: Number(e.target.value) }))}
                >
                  {months.map((m, i) => (
                    <option key={m} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </Select>
              </Field>
            </details>
            <label className="check">
              <input type="checkbox" name="shareRegional" defaultChecked />
              <span>
                {tShare('setup')}{' '}
                <a href="/privacy" target="_blank">
                  {tShare('privacy')}
                </a>
              </span>
            </label>
          </div>

          <div {...page('you')}>
            <h2>{t('you.title')}</h2>
            <p className="muted">{t('you.body')}</p>
            <Field label={t('fields.ownerName')} error={errors.ownerName}>
              <Input
                name="ownerName"
                autoComplete="name"
                defaultValue={defaults.ownerName}
                required
              />
            </Field>
            <div className="fld">
              <span className="fld-l">{t('fields.colour')}</span>
              <SwatchPick name="colour" value={PALETTE[0]!.light} label={t('fields.colour')} />
              <span className="fld-h">{t('hints.colour')}</span>
            </div>
            <Field
              label={t('fields.activeFrom')}
              error={errors.activeFrom}
              hint={t('hints.activeFrom')}
            >
              <Input
                name="activeFrom"
                type="date"
                defaultValue={defaults.activeFrom}
                className="narrow"
                required
              />
            </Field>
          </div>

          <div {...page('colours')}>
            <h2>{t('colours.title')}</h2>
            <p className="muted">{t('colours.body')}</p>
            <PresetCards current={DEFAULT_APPEARANCE.preset} radio />
            <div className="set-row">
              <span>
                <b>{ta('lightOrDark')}</b>
                <span className="muted small">{ta('lightOrDarkBody')}</span>
              </span>
              <input type="hidden" name="theme" value={theme} />
              <Segmented
                small
                value={theme}
                label={ta('lightOrDark')}
                onChange={(v) => setTheme(v as Theme)}
                items={[
                  { value: 'light', label: ta('themes.light'), icon: 'sun' },
                  { value: 'dark', label: ta('themes.dark'), icon: 'moon' },
                  { value: 'auto', label: ta('themes.auto'), icon: 'devices' },
                ]}
              />
            </div>
          </div>

          <div className="form-acts spread">
            {index > 0 ? (
              <Button
                type="button"
                variant="ghost"
                icon="chevron-left"
                onClick={() => setStep(STEPS[index - 1]!)}
              >
                {t('back')}
              </Button>
            ) : (
              <span />
            )}
            {/* Different keys: reusing one <button> would flip its type to submit while the click still lands. */}
            {index < STEPS.length - 1 ? (
              <Button key="next" type="button" onClick={next}>
                {t('next')}
              </Button>
            ) : (
              <Button key="finish" type="submit" icon="check" disabled={pending}>
                {pending ? '…' : t('submit')}
              </Button>
            )}
          </div>
        </>
      )}
    </ActionForm>
  );
}

/** When the server rejects a field, show the step that owns it. */
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
