'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button, Field, Input, Select } from '@/components/ui';
import { ActionForm } from '@/components/ui/form';
import { LocationField } from '@/components/app/location-field';
import { Stepper } from '@/components/app/pieces';
import { SwatchPick } from '@/components/app/pieces-client';
import { PALETTE } from '@/lib/palette';
import { completeSetup } from './actions';
import { Icon } from '@/components/app/icons';
import { ALLOWANCE_PERIODS, HOUSEHOLD_TYPES } from '@/db/schema';
import { roleKey, typeIcon, type HouseholdType } from '@/lib/household-types';

const STEPS = ['household', 'where', 'you'] as const;
type Step = (typeof STEPS)[number];
const FIELDS: Record<Step, string[]> = {
  household: ['householdName', 'type', 'address', 'utilities', 'allowance', 'allowancePeriod'],
  where: ['currency', 'locale', 'timezone', 'fiscalYearStartMonth', 'country', 'postalCode'],
  you: ['ownerName', 'activeFrom', 'colour'],
};

/**
 * The setup wizard: Household → Where → You, one form with
 * only the current step visible. Continue runs the browser's own validation
 * for that step, and the server's field errors jump back to the step that
 * owns them. The account's PIN comes after, on its own screen, the first time.
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
  const tShare = useTranslations('sharing');
  const tt = useTranslations('householdTypes');
  const tr = useTranslations('roles');
  const tp = useTranslations('allowancePeriods');
  const [step, setStep] = useState<Step>('household');
  const [type, setType] = useState<HouseholdType>('share_house');
  const [utilities, setUtilities] = useState<'no' | 'yes'>('no');
  const [region, setRegion] = useState({
    currency: defaults.currency,
    timezone: defaults.timezone,
    fy: defaults.fiscalYearStartMonth,
  });
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
              <legend className="fld-l">{t('fields.type')}</legend>
              <div className="radio-cards type-cards">
                {HOUSEHOLD_TYPES.map((k) => (
                  <label key={k} className={type === k ? 'rcard on' : 'rcard'}>
                    <input
                      type="radio"
                      name="type"
                      value={k}
                      checked={type === k}
                      onChange={() => setType(k)}
                    />
                    <span className="rcard-ic">
                      <Icon name={typeIcon(k)} width={18} height={18} />
                    </span>
                    <b>{tt(`${k}.name`)}</b>
                    <span className="muted small">{tt(`${k}.blurb`)}</span>
                  </label>
                ))}
              </div>
              <span className="fld-h">
                {tt('yourRole', { role: tr(roleKey('owner', type)) })} {t('hints.type')}
              </span>
            </fieldset>
            {type === 'investment_property' && (
              <>
                <Field label={t('fields.address')} hint={t('hints.address')} optional>
                  <Input name="address" autoComplete="street-address" maxLength={120} />
                </Field>
                <fieldset className="fld">
                  <legend className="fld-l">{t('fields.utilities')}</legend>
                  <div className="radio-cards">
                    {(['no', 'yes'] as const).map((u) => (
                      <label key={u} className={utilities === u ? 'rcard on' : 'rcard'}>
                        <input
                          type="radio"
                          name="utilities"
                          value={u}
                          checked={utilities === u}
                          onChange={() => setUtilities(u)}
                        />
                        <b>{t(`utilities.${u}.label`)}</b>
                        <span className="muted small">{t(`utilities.${u}.body`)}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                {utilities === 'yes' && (
                  <div className="fld-row">
                    <Field label={t('fields.allowance')} hint={t('hints.allowance')}>
                      <Input
                        name="allowance"
                        inputMode="decimal"
                        placeholder="200"
                        className="narrow"
                        required
                      />
                    </Field>
                    <Field label={t('fields.allowancePeriod')}>
                      <Select name="allowancePeriod" defaultValue="month">
                        {ALLOWANCE_PERIODS.map((k) => (
                          <option key={k} value={k}>
                            {tp(k)}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                )}
              </>
            )}
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
