'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { StackBar } from '@/components/charts/stack-bar';
import { ToggleRow } from '@/components/app/pieces';
import { Button, Card, Field, Input, LinkButton, Select, Textarea } from '@/components/ui';
import { SectionHead } from '@/components/ui/blocks';
import { Avatar } from '@/components/ui/colour';
import { Segmented, Toggle } from '@/components/ui/controls';
import { ActionForm, type FormAction } from '@/components/ui/form';
import { formatMoney, parseMoneyToMinor } from '@/lib/format';

export interface BillFormService {
  id: string;
  name: string;
  provider: string;
  usageUnit: string | null;
  cadence: string;
  /** Recurring now: the same charge every cadence. */
  recurring?: boolean;
  /** Its bills are filed under a vehicle or policy (Vehicles, Health). */
  kind?: 'vehicle' | 'policy' | null;
}

export interface BillFormValues {
  id?: string;
  serviceId: string;
  amount: string;
  tax: string;
  taxLabel: string;
  periodStart: string;
  periodEnd: string;
  issueDate: string;
  dueDate: string;
  usageQuantity: string;
  usageUnit: string;
  externalRef: string;
  notes: string;
  paidToProvider: boolean;
  /** The vehicle or policy it's for ('' = none yet). */
  assetId?: string;
}

/** How a service splits a bill, for the preview beside the form: each person's fraction. */
export interface SplitPreview {
  /** "Evenly, by the days each person lived here" */
  how: string;
  parts: { name: string; colour: string; fraction: number }[];
}

/**
 * Adding or editing a bill by hand (a permanent first-class feature): the
 * bill's details on the left, and beside them how it will be split (parts
 * update as the amount is typed), whose it is, and, when editing, its delete.
 */
export function BillForm({
  action,
  deleteAction,
  services,
  units,
  currency,
  locale,
  initial,
  submitLabel,
  locked,
  cancelHref,
  whose,
  splits = {},
  assets = [],
}: {
  action: FormAction;
  /** Editing: deletes the bill (a second action on the same form). */
  deleteAction?: (fd: FormData) => Promise<void>;
  services: BillFormService[];
  units: { key: string; label: string }[];
  currency: string;
  locale: string;
  initial: BillFormValues;
  submitLabel: string;
  /** Amount and period are locked once a housemate has paid a share. */
  locked?: boolean;
  cancelHref: string;
  /** Whose the bill is, when this member may switch it (others live there too). */
  whose?: { value: 'mine' | 'household'; split: boolean };
  /** Per service, how a bill of it is split (household services that split). */
  splits?: Record<string, SplitPreview>;
  /** Vehicles and policies this member sees ("Yours" already in the name). */
  assets?: { id: string; name: string; kind: 'vehicle' | 'policy' }[];
}) {
  const t = useTranslations('bills.form');
  const ta = useTranslations('assets');
  const tc = useTranslations('common');
  const [serviceId, setServiceId] = useState(initial.serviceId);
  const svc = services.find((s) => s.id === serviceId);
  const [usageUnit, setUsageUnit] = useState(initial.usageUnit || svc?.usageUnit || '');
  const [amount, setAmount] = useState(initial.amount);
  const [whoseValue, setWhoseValue] = useState(whose?.value ?? 'household');
  const [recurring, setRecurring] = useState(!!svc?.recurring);
  const [assetId, setAssetId] = useState(initial.assetId ?? '');
  const kind = svc?.kind ?? null;
  const choices = kind ? assets.filter((a) => a.kind === kind) : [];
  // A vehicle or policy decides whose the bill is.
  const byAsset = choices.some((a) => a.id === assetId);
  const split = splits[serviceId];
  const minor = parseMoneyToMinor(amount, currency) ?? 0;
  const money = (m: number) => formatMoney(m, currency, locale);

  return (
    <ActionForm action={action} submitLabel={submitLabel} hideSubmit className="form-scr">
      {(errors, pending) => (
        <>
          {initial.id && <input type="hidden" name="id" value={initial.id} />}
          <div className="form-grid">
            <Card className="form-main">
              <SectionHead title={t('theBill')} />
              {locked && (
                <p className="well small" role="status">
                  {t('lockedNote')}
                </p>
              )}
              <Field label={t('service')} error={errors.serviceId}>
                <Select
                  name="serviceId"
                  value={serviceId}
                  onChange={(e) => {
                    setServiceId(e.target.value);
                    const next = services.find((s) => s.id === e.target.value);
                    if (next?.usageUnit) setUsageUnit(next.usageUnit);
                    setRecurring(!!next?.recurring);
                  }}
                  disabled={locked}
                >
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} · {s.provider}
                    </option>
                  ))}
                </Select>
                {locked && <input type="hidden" name="serviceId" value={serviceId} />}
              </Field>
              {kind && choices.length > 0 && (
                <Field label={ta(`${kind}.label`)} hint={ta(`${kind}.formHint`)}>
                  <Select
                    name="assetId"
                    value={byAsset ? assetId : ''}
                    onChange={(e) => setAssetId(e.target.value)}
                  >
                    <option value="">{ta(`${kind}.none`)}</option>
                    {choices.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              <div className="fld-row">
                <Field label={t('amount', { currency })} error={errors.amount}>
                  <Input
                    name="amount"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="129.00"
                    readOnly={locked}
                    required
                  />
                </Field>
                <Field label={t('dueDate')} error={errors.dueDate}>
                  <Input name="dueDate" type="date" defaultValue={initial.dueDate} required />
                </Field>
              </div>
              <div className="fld-row">
                <Field label={t('periodStart')} error={errors.periodStart}>
                  <Input
                    name="periodStart"
                    type="date"
                    defaultValue={initial.periodStart}
                    readOnly={locked}
                    required
                  />
                </Field>
                <Field label={t('periodEnd')} error={errors.periodEnd}>
                  <Input
                    name="periodEnd"
                    type="date"
                    defaultValue={initial.periodEnd}
                    readOnly={locked}
                    required
                  />
                </Field>
              </div>
              <div className="fld-row">
                <Field label={t('issueDate')} error={errors.issueDate} optional>
                  <Input name="issueDate" type="date" defaultValue={initial.issueDate} />
                </Field>
                <Field
                  label={t('externalRef')}
                  error={errors.externalRef}
                  hint={t('externalRefHint')}
                  optional
                >
                  <Input
                    name="externalRef"
                    defaultValue={initial.externalRef}
                    className="mono"
                    placeholder={t('externalRefPlaceholder')}
                  />
                </Field>
              </div>
              <div className="fld-row">
                <Field
                  label={t('usageQuantity')}
                  error={errors.usageQuantity}
                  hint={t('usageHint')}
                  optional
                >
                  <Input
                    name="usageQuantity"
                    inputMode="decimal"
                    defaultValue={initial.usageQuantity}
                  />
                </Field>
                <Field label={t('usageUnit')} error={errors.usageUnit}>
                  <Select
                    name="usageUnit"
                    value={usageUnit}
                    onChange={(e) => setUsageUnit(e.target.value)}
                  >
                    <option value="">—</option>
                    {units.map((u) => (
                      <option key={u.key} value={u.key}>
                        {u.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div className="fld-row">
                <Field label={t('tax')} error={errors.tax} optional>
                  <Input
                    name="tax"
                    inputMode="decimal"
                    defaultValue={initial.tax}
                    placeholder="0.00"
                  />
                </Field>
                <Field label={t('taxLabel')} error={errors.taxLabel}>
                  <Input
                    name="taxLabel"
                    defaultValue={initial.taxLabel}
                    placeholder={t('taxLabelPlaceholder')}
                  />
                </Field>
              </div>
              <Field label={t('notes')} optional>
                <Textarea
                  name="notes"
                  defaultValue={initial.notes}
                  placeholder={t('notesPlaceholder')}
                  rows={3}
                />
              </Field>
              <ToggleRow title={t('paidToProvider')} sub={t('paidToProviderSub')}>
                <Toggle
                  name="paidToProvider"
                  label={t('paidToProvider')}
                  defaultChecked={initial.paidToProvider}
                />
              </ToggleRow>
            </Card>

            <div className="form-side">
              {split && (
                <Card>
                  <SectionHead
                    title={t('split.title')}
                    right={<span className="muted small">{t('split.setOn')}</span>}
                  />
                  <StackBar
                    parts={split.parts.map((p) => ({
                      label: p.name,
                      value: p.fraction,
                      colour: p.colour,
                      text: money(Math.round(minor * p.fraction)),
                    }))}
                  />
                  <div className="shares">
                    {split.parts.map((p) => (
                      <div key={p.name} className="share-row">
                        <Avatar name={p.name} colour={p.colour} size="sm" />
                        <span className="sr-name">{p.name}</span>
                        <span className="sr-amt">{money(Math.round(minor * p.fraction))}</span>
                      </div>
                    ))}
                  </div>
                  <p className="muted small">
                    {split.how}. {t('split.live')}
                  </p>
                </Card>
              )}
              {svc && svc.cadence !== 'irregular' && (
                <Card>
                  <input type="hidden" name="recurringShown" value="1" />
                  <ToggleRow title={t('recurring')} sub={t('recurringHint')}>
                    <Toggle
                      name="recurring"
                      label={t('recurring')}
                      checked={recurring}
                      onChange={(e) => setRecurring(e.target.checked)}
                    />
                  </ToggleRow>
                </Card>
              )}
              {whose && !byAsset && (
                <Card>
                  <SectionHead title={t('whose')} />
                  <input type="hidden" name="whose" value={whoseValue} />
                  <Segmented
                    small
                    value={whoseValue}
                    label={t('whose')}
                    onChange={(v) => setWhoseValue(v as 'mine' | 'household')}
                    items={[
                      { value: 'household', label: t('whoseOptions.household'), icon: 'users' },
                      { value: 'mine', label: t('whoseOptions.mine'), icon: 'user' },
                    ]}
                  />
                  <p className="muted small">
                    {t(`whoseHints.${whoseValue}`, { split: whose.split ? 'yes' : 'no' })}.{' '}
                    {t('whoseNote')}
                  </p>
                </Card>
              )}
              {deleteAction && initial.id && (
                <Card className="danger">
                  <SectionHead title={t('delete.title')} />
                  <p className="muted small">{t('delete.body')}</p>
                  <Button
                    type="submit"
                    variant="ghost"
                    icon="x"
                    className="btn-danger self-start"
                    formAction={deleteAction}
                    formNoValidate
                    onClick={(e) => {
                      if (!window.confirm(t('delete.confirm'))) e.preventDefault();
                    }}
                  >
                    {t('delete.cta')}
                  </Button>
                </Card>
              )}
            </div>
          </div>
          <div className="form-acts">
            <Button type="submit" icon="check" disabled={pending}>
              {pending ? '…' : submitLabel}
            </Button>
            <LinkButton href={cancelHref} variant="ghost">
              {tc('cancel')}
            </LinkButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}
