'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Card, Field, Input, Select, Textarea } from '@/components/ui';
import { ActionForm, type FormAction } from '@/components/ui/form';

export interface BillFormService {
  id: string;
  name: string;
  provider: string;
  usageUnit: string | null;
  cadence: string;
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
}

export function BillForm({
  action,
  services,
  units,
  currency,
  initial,
  submitLabel,
  locked,
  cancelHref,
  whose,
}: {
  action: FormAction;
  services: BillFormService[];
  units: { key: string; label: string }[];
  currency: string;
  initial: BillFormValues;
  submitLabel: string;
  /** Amount and period are locked once a housemate has paid a share. */
  locked?: boolean;
  cancelHref: string;
  /** Whose the bill is, when this member may switch it (others live there too). */
  whose?: { value: 'mine' | 'household'; split: boolean };
}) {
  const t = useTranslations('bills.form');
  const [serviceId, setServiceId] = useState(initial.serviceId);
  const svc = services.find((s) => s.id === serviceId);
  const [usageUnit, setUsageUnit] = useState(initial.usageUnit || svc?.usageUnit || '');

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
          {locked && (
            <p className="rounded-xl bg-warning/10 px-4 py-3 text-sm text-warning">
              {t('lockedNote')}
            </p>
          )}
          <Card className="flex flex-col gap-4">
            <Field label={t('service')} error={errors.serviceId}>
              <Select
                name="serviceId"
                value={serviceId}
                onChange={(e) => {
                  setServiceId(e.target.value);
                  const next = services.find((s) => s.id === e.target.value);
                  if (next?.usageUnit) setUsageUnit(next.usageUnit);
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
            {whose && (
              <fieldset>
                <legend className="mb-1.5 text-sm font-medium">{t('whose')}</legend>
                <div className="grid grid-cols-2 gap-2">
                  {(['household', 'mine'] as const).map((w) => (
                    <label
                      key={w}
                      className="flex cursor-pointer items-start gap-2.5 rounded-2xl border border-border-strong bg-surface-2 p-3 has-[:checked]:border-accent has-[:checked]:bg-accent-soft"
                    >
                      <input
                        type="radio"
                        name="whose"
                        value={w}
                        defaultChecked={whose.value === w}
                        className="mt-0.5 size-4 accent-accent"
                      />
                      <span className="text-sm">
                        <span className="block font-semibold">{t(`whoseOptions.${w}`)}</span>
                        <span className="block text-xs text-fg-muted">
                          {t(`whoseHints.${w}${whose.split ? '' : 'NoSplit'}`)}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
                <p className="mt-1.5 text-xs text-fg-muted">{t('whoseNote')}</p>
              </fieldset>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('amount', { currency })} error={errors.amount}>
                <Input
                  name="amount"
                  inputMode="decimal"
                  defaultValue={initial.amount}
                  placeholder="129.00"
                  readOnly={locked}
                  required
                />
              </Field>
              <Field
                label={t('externalRef')}
                error={errors.externalRef}
                hint={t('externalRefHint')}
              >
                <Input name="externalRef" defaultValue={initial.externalRef} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('tax')} error={errors.tax}>
                <Input
                  name="tax"
                  inputMode="decimal"
                  defaultValue={initial.tax}
                  placeholder="0.00"
                />
              </Field>
              <Field label={t('taxLabel')} error={errors.taxLabel}>
                <Input name="taxLabel" defaultValue={initial.taxLabel} placeholder="GST / VAT" />
              </Field>
            </div>
          </Card>

          <Card className="flex flex-col gap-4">
            <h2 className="font-semibold">{t('dates')}</h2>
            <div className="grid grid-cols-2 gap-3">
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
              <Field label={t('issueDate')} error={errors.issueDate}>
                <Input name="issueDate" type="date" defaultValue={initial.issueDate} />
              </Field>
              <Field label={t('dueDate')} error={errors.dueDate}>
                <Input name="dueDate" type="date" defaultValue={initial.dueDate} required />
              </Field>
            </div>
          </Card>

          <Card className="flex flex-col gap-4">
            <h2 className="font-semibold">{t('usage')}</h2>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('usageQuantity')} error={errors.usageQuantity}>
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
            <Field label={t('notes')}>
              <Textarea name="notes" defaultValue={initial.notes} />
            </Field>
            <label className="flex items-center gap-3 text-sm font-medium">
              <input
                type="checkbox"
                name="paidToProvider"
                defaultChecked={initial.paidToProvider}
                className="size-5 accent-accent"
              />
              {t('paidToProvider')}
            </label>
          </Card>
        </>
      )}
    </ActionForm>
  );
}
