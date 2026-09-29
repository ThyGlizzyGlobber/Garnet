'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Card, Field, Input, Select, Textarea } from '@/components/ui';
import { ActionForm, type FormAction } from '@/components/ui/form';

export interface ServiceFormValues {
  id?: string;
  typeSlug: string;
  name: string;
  provider: string;
  accountRef: string;
  cadence: string;
  usageUnit: string;
  usageLimit: string;
  splitMode: string;
  payerMemberId: string;
  colour: string;
  isActive: boolean;
  notes: string;
  trustedSenders: string;
  autoPay: boolean;
  seasonal: boolean;
  customSplits: Record<string, number>;
  /** Just for the member filling in the form (only they see it; not split). */
  personal: boolean;
}

export function ServiceForm({
  action,
  initial,
  types,
  units,
  members,
  cadences,
  splitModes,
  sharedHousehold,
  canChangePersonal = true,
  submitLabel,
  cancelHref,
}: {
  action: FormAction;
  initial: ServiceFormValues;
  types: {
    slug: string;
    label: string;
    defaultUnit: string | null;
    personalByDefault?: boolean;
  }[];
  units: { key: string; label: string }[];
  members: { id: string; name: string }[];
  cadences: readonly string[];
  splitModes: readonly string[];
  sharedHousehold: boolean;
  /** Whether this member may switch it between household and personal. */
  canChangePersonal?: boolean;
  submitLabel: string;
  cancelHref: string;
}) {
  const t = useTranslations('services.form');
  const [typeSlug, setTypeSlug] = useState(initial.typeSlug);
  const [usageUnit, setUsageUnit] = useState(initial.usageUnit);
  const [splitMode, setSplitMode] = useState(initial.splitMode);
  const [name, setName] = useState(initial.name);
  const [personal, setPersonal] = useState(initial.personal);
  const [personalTouched, setPersonalTouched] = useState(false);

  return (
    <ActionForm
      action={action}
      submitLabel={submitLabel}
      footer={
        <a href={cancelHref} className="text-sm font-medium text-fg-muted hover:text-fg">
          {t('cancel')}
        </a>
      }
    >
      {(errors) => (
        <>
          {initial.id && <input type="hidden" name="id" value={initial.id} />}
          <Card className="flex flex-col gap-4">
            <Field label={t('type')} error={errors.typeSlug}>
              <Select
                name="typeSlug"
                value={typeSlug}
                onChange={(e) => {
                  setTypeSlug(e.target.value);
                  const ty = types.find((x) => x.slug === e.target.value);
                  if (ty) {
                    setUsageUnit(ty.defaultUnit ?? '');
                    if (!name) setName(ty.label);
                    // A new car rego or car insurance is usually one person's own.
                    if (!initial.id && !personalTouched && sharedHousehold)
                      setPersonal(!!ty.personalByDefault);
                  }
                }}
              >
                {types.map((ty) => (
                  <option key={ty.slug} value={ty.slug}>
                    {ty.label}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('name')} error={errors.name}>
                <Input
                  name="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </Field>
              <Field label={t('provider')} error={errors.provider}>
                <Input
                  name="provider"
                  defaultValue={initial.provider}
                  placeholder="Aussie Broadband"
                  required
                />
              </Field>
              <Field label={t('accountRef')} error={errors.accountRef}>
                <Input name="accountRef" defaultValue={initial.accountRef} />
              </Field>
              <Field label={t('cadence')} error={errors.cadence}>
                <Select name="cadence" defaultValue={initial.cadence}>
                  {cadences.map((c) => (
                    <option key={c} value={c}>
                      {t(`cadences.${c}`)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('usageUnit')} error={errors.usageUnit}>
                <Select
                  name="usageUnit"
                  value={usageUnit}
                  onChange={(e) => setUsageUnit(e.target.value)}
                >
                  <option value="">{t('noUsage')}</option>
                  {units.map((u) => (
                    <option key={u.key} value={u.key}>
                      {u.label}
                    </option>
                  ))}
                </Select>
              </Field>
              {usageUnit && (
                <Field
                  label={t('usageLimit', {
                    unit: units.find((u) => u.key === usageUnit)?.label ?? usageUnit,
                  })}
                  hint={t('usageLimitHint')}
                  error={errors.usageLimit}
                >
                  <Input
                    name="usageLimit"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    defaultValue={initial.usageLimit}
                  />
                </Field>
              )}
              <Field label={t('colour')} error={errors.colour}>
                <Input
                  name="colour"
                  type="color"
                  defaultValue={initial.colour}
                  className="h-11 p-1"
                />
              </Field>
            </div>
            <Field label={t('notes')}>
              <Textarea name="notes" defaultValue={initial.notes} />
            </Field>
            <label className="flex items-start gap-3 text-sm font-medium">
              <input
                type="checkbox"
                name="autoPay"
                defaultChecked={initial.autoPay}
                className="mt-0.5 size-5 accent-accent"
              />
              <span>
                {t('autoPay')}
                <span className="block text-xs font-normal text-fg-muted">{t('autoPayHint')}</span>
              </span>
            </label>
            <label className="flex items-start gap-3 text-sm font-medium">
              <input
                type="checkbox"
                name="seasonal"
                defaultChecked={initial.seasonal}
                className="mt-0.5 size-5 accent-accent"
              />
              <span>
                {t('seasonal')}
                <span className="block text-xs font-normal text-fg-muted">{t('seasonalHint')}</span>
              </span>
            </label>
            <Field label={t('trustedSenders')} hint={t('trustedSendersHint')}>
              <Input
                name="trustedSenders"
                defaultValue={initial.trustedSenders}
                placeholder="provider.com.au"
                autoComplete="off"
              />
            </Field>
            {initial.id && (
              <label className="flex items-center gap-3 text-sm font-medium">
                <input
                  type="checkbox"
                  name="isActive"
                  defaultChecked={initial.isActive}
                  className="size-5 accent-accent"
                />
                {t('isActive')}
              </label>
            )}
            {!initial.id && <input type="hidden" name="isActive" value="on" />}
          </Card>

          {sharedHousehold && (
            <Card className="flex flex-col gap-3">
              <label
                className={`flex items-start gap-3 text-sm font-medium ${canChangePersonal ? '' : 'opacity-60'}`}
              >
                <input
                  type="checkbox"
                  name="personal"
                  checked={personal}
                  disabled={!canChangePersonal}
                  onChange={(e) => {
                    setPersonal(e.target.checked);
                    setPersonalTouched(true);
                  }}
                  className="mt-0.5 size-5 accent-accent"
                />
                <span>
                  {t('personal')}
                  <span className="block text-xs font-normal text-fg-muted">
                    {t('personalHint')}
                  </span>
                </span>
              </label>
              {!canChangePersonal && personal && <input type="hidden" name="personal" value="on" />}
            </Card>
          )}

          {sharedHousehold && !personal && (
            <Card className="flex flex-col gap-4">
              <h2 className="font-semibold">{t('splitting')}</h2>
              <Field label={t('payer')} hint={t('payerHint')}>
                <Select name="payerMemberId" defaultValue={initial.payerMemberId}>
                  <option value="">{t('noPayer')}</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('splitMode')}>
                <Select
                  name="splitMode"
                  value={splitMode}
                  onChange={(e) => setSplitMode(e.target.value)}
                >
                  {splitModes.map((m) => (
                    <option key={m} value={m}>
                      {t(`splitModes.${m}`)}
                    </option>
                  ))}
                </Select>
              </Field>
              {splitMode === 'custom' && (
                <div className="grid grid-cols-2 gap-3">
                  {members.map((m) => (
                    <Field key={m.id} label={m.name}>
                      <Input
                        name={`weight_${m.id}`}
                        inputMode="decimal"
                        defaultValue={String(initial.customSplits[m.id] ?? 1)}
                      />
                    </Field>
                  ))}
                </div>
              )}
            </Card>
          )}
          {(!sharedHousehold || personal) && (
            <>
              <input type="hidden" name="splitMode" value="equal" />
              <input type="hidden" name="payerMemberId" value="" />
            </>
          )}
        </>
      )}
    </ActionForm>
  );
}
