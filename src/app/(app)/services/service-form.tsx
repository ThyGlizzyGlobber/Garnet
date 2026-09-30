'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ToggleRow } from '@/components/app/pieces';
import { TypePicker } from '@/components/app/pieces-client';
import { Button, Card, Field, Input, LinkButton, Select, Textarea } from '@/components/ui';
import { SectionHead } from '@/components/ui/blocks';
import { Avatar } from '@/components/ui/colour';
import { Toggle } from '@/components/ui/controls';
import { ActionForm, type FormAction } from '@/components/ui/form';
import { groupTypes } from '@/lib/service-categories';
import { SplitEditor, type SplitMemberOption } from './split-editor';

/** How it's split, for the form: what's stored, and what admins need to change it. */
export interface ServiceFormSplit {
  /** Only admins change how a service is split (and who pays it). */
  canEdit: boolean;
  currency: string;
  locale: string;
  latestMinor: number | null;
  resplitCount: number;
  percents: Record<string, number>;
  amounts: Record<string, string>;
  /** Read-only lines for members who can't change it ("Jordan · 40%"). */
  summary: { name: string; colour: string; part: string }[];
}

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
  isActive: boolean;
  notes: string;
  trustedSenders: string;
  autoPay: boolean;
  seasonal: boolean;
  /** Just for the member filling in the form (only they see it; not split). */
  personal: boolean;
}

/**
 * Adding or editing a service: what it is on the left (type, name, provider,
 * how often, usage, the switches; its colour is its type's), and beside it who pays and how it's
 * split (admins), and, when editing, stop tracking.
 */
export function ServiceForm({
  action,
  initial,
  types,
  units,
  members,
  split,
  cadences,
  splitModes,
  sharedHousehold,
  canBePersonal = sharedHousehold,
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
    category?: string;
    /** A main service: each provider is a sub-service named after it (Netflix). */
    hasSubServices?: boolean;
  }[];
  units: { key: string; label: string }[];
  members: SplitMemberOption[];
  split: ServiceFormSplit;
  cadences: readonly string[];
  splitModes: readonly string[];
  sharedHousehold: boolean;
  /** Others live there too, so a service can be just one person's (split or not). */
  canBePersonal?: boolean;
  /** Whether this member may switch it between household and personal. */
  canChangePersonal?: boolean;
  submitLabel: string;
  cancelHref: string;
}) {
  const t = useTranslations('services.form');
  const tc = useTranslations('services.categories');
  const tco = useTranslations('common');
  const groups = groupTypes(types).map((g) => ({
    category: g.category,
    label: tc(g.category),
    types: g.types.map((ty) => ({ slug: ty.slug, label: ty.label })),
  }));
  const [typeSlug, setTypeSlug] = useState(initial.typeSlug);
  const [usageUnit, setUsageUnit] = useState(initial.usageUnit);
  const [name, setName] = useState(initial.name);
  const [provider, setProvider] = useState(initial.provider);
  const sub = !!types.find((x) => x.slug === typeSlug)?.hasSubServices;
  const [personal, setPersonal] = useState(initial.personal);
  const [personalTouched, setPersonalTouched] = useState(false);
  const unitLabel = units.find((u) => u.key === usageUnit)?.label ?? usageUnit;

  return (
    <ActionForm action={action} submitLabel={submitLabel} hideSubmit className="form-scr">
      {(errors, pending) => (
        <>
          {initial.id && <input type="hidden" name="id" value={initial.id} />}
          <div className="form-grid">
            <Card className="form-main">
              <SectionHead title={t('whatItIs')} />
              <div className="fld">
                <span className="fld-l">{t('type')}</span>
                <TypePicker
                  name="typeSlug"
                  groups={groups}
                  value={typeSlug}
                  onChange={(slug) => {
                    setTypeSlug(slug);
                    const ty = types.find((x) => x.slug === slug);
                    if (ty) {
                      setUsageUnit(ty.defaultUnit ?? '');
                      if (!name || types.some((x) => x.label === name))
                        setName(ty.hasSubServices ? '' : ty.label);
                      // A new car rego or car insurance is usually one person's own.
                      if (!initial.id && !personalTouched && canBePersonal)
                        setPersonal(!!ty.personalByDefault);
                    }
                  }}
                />
                {errors.typeSlug && <span className="fld-h bad-text">{errors.typeSlug}</span>}
              </div>
              {sub ? (
                <>
                  {/* A sub-service is named after its provider: Netflix, Red Cross. */}
                  <input type="hidden" name="name" value={provider} />
                  <Field
                    label={t('subProvider')}
                    hint={t('subProviderHint')}
                    error={errors.provider ?? errors.name}
                  >
                    <Input
                      name="provider"
                      value={provider}
                      onChange={(e) => setProvider(e.target.value)}
                      placeholder={t('subProviderPlaceholder')}
                      required
                    />
                  </Field>
                </>
              ) : (
                <div className="fld-row">
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
                      value={provider}
                      onChange={(e) => setProvider(e.target.value)}
                      placeholder={t('providerPlaceholder')}
                      required
                    />
                  </Field>
                </div>
              )}
              <div className="fld-row">
                <Field label={t('cadence')} error={errors.cadence}>
                  <Select name="cadence" defaultValue={initial.cadence}>
                    {cadences.map((c) => (
                      <option key={c} value={c}>
                        {t(`cadences.${c}`)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={t('usageUnit')} error={errors.usageUnit} optional>
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
              </div>
              <div className="fld-row">
                {usageUnit ? (
                  <Field
                    label={t('usageLimit', { unit: unitLabel })}
                    hint={t('usageLimitHint')}
                    error={errors.usageLimit}
                    optional
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
                ) : (
                  <input type="hidden" name="usageLimit" value="" />
                )}
                <Field label={t('accountRef')} error={errors.accountRef} optional>
                  <Input name="accountRef" defaultValue={initial.accountRef} className="mono" />
                </Field>
              </div>
              <Field label={t('notes')} optional>
                <Textarea name="notes" defaultValue={initial.notes} rows={2} />
              </Field>
              <Field label={t('trustedSenders')} hint={t('trustedSendersHint')} optional>
                <Input
                  name="trustedSenders"
                  defaultValue={initial.trustedSenders}
                  placeholder={t('trustedSendersPlaceholder')}
                  autoComplete="off"
                />
              </Field>
              <ToggleRow title={t('seasonal')} sub={t('seasonalHint')}>
                <Toggle name="seasonal" label={t('seasonal')} defaultChecked={initial.seasonal} />
              </ToggleRow>
              <ToggleRow title={t('autoPay')} sub={t('autoPayHint')}>
                <Toggle name="autoPay" label={t('autoPay')} defaultChecked={initial.autoPay} />
              </ToggleRow>
              {canBePersonal && (
                <ToggleRow title={t('personal')} sub={t('personalHint')}>
                  <Toggle
                    name="personal"
                    label={t('personal')}
                    checked={personal}
                    disabled={!canChangePersonal}
                    onChange={(e) => {
                      setPersonal(e.target.checked);
                      setPersonalTouched(true);
                    }}
                  />
                  {!canChangePersonal && personal && (
                    <input type="hidden" name="personal" value="on" />
                  )}
                </ToggleRow>
              )}
              {!initial.id && <input type="hidden" name="isActive" value="on" />}
            </Card>

            <div className="form-side">
              {sharedHousehold && !personal ? (
                <Card id="split">
                  <SectionHead
                    title={t('splitting')}
                    right={<span className="muted small">{t('admins')}</span>}
                  />
                  {split.canEdit ? (
                    <SplitEditor
                      members={members}
                      modes={splitModes}
                      initialMode={initial.splitMode}
                      percents={split.percents}
                      amounts={split.amounts}
                      currency={split.currency}
                      locale={split.locale}
                      latestMinor={split.latestMinor}
                      resplitCount={split.resplitCount}
                      payerMemberId={initial.payerMemberId}
                    />
                  ) : (
                    <>
                      <div className="se-list">
                        {split.summary.map((r) => (
                          <div key={r.name} className="se-row">
                            <Avatar name={r.name} colour={r.colour} />
                            <span className="se-n">
                              <b>{r.name}</b>
                            </span>
                            <span className="muted small">{r.part}</span>
                            <span />
                          </div>
                        ))}
                      </div>
                      <p className="muted small">{t('splitAdminsOnly')}</p>
                      <input type="hidden" name="payerMemberId" value={initial.payerMemberId} />
                      <input type="hidden" name="splitMode" value={initial.splitMode} />
                    </>
                  )}
                </Card>
              ) : (
                <>
                  <input type="hidden" name="splitMode" value="equal" />
                  <input type="hidden" name="payerMemberId" value="" />
                </>
              )}
              {initial.id && sub && (
                // Cancelling a sub-service is on its page (Cancel), which records who and when.
                <input type="hidden" name="isActive" value={initial.isActive ? 'on' : ''} />
              )}
              {initial.id && !sub && (
                <Card className="danger">
                  <SectionHead title={t('stop.title')} />
                  <p className="muted small">{t('stop.body')}</p>
                  <ToggleRow title={t('isActive')}>
                    <Toggle
                      name="isActive"
                      label={t('isActive')}
                      defaultChecked={initial.isActive}
                    />
                  </ToggleRow>
                </Card>
              )}
            </div>
          </div>
          <div className="form-acts">
            <Button type="submit" icon="check" disabled={pending}>
              {pending ? '…' : submitLabel}
            </Button>
            <LinkButton href={cancelHref} variant="ghost">
              {tco('cancel')}
            </LinkButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}
