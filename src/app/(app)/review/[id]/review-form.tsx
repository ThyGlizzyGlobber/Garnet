'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Card, Field, Input, Select, Textarea } from '@/components/ui';
import { ActionForm } from '@/components/ui/form';
import { approveReviewAction } from '../actions';

export function ReviewForm({
  documentId,
  services,
  units,
  currency,
  initial,
  noServiceMatch,
  providerHint,
  trustSender,
}: {
  documentId: string;
  services: { id: string; name: string; provider: string; usageUnit: string | null }[];
  units: { key: string; label: string }[];
  currency: string;
  initial: Record<
    | 'serviceId'
    | 'amount'
    | 'tax'
    | 'taxLabel'
    | 'periodStart'
    | 'periodEnd'
    | 'issueDate'
    | 'dueDate'
    | 'usageQuantity'
    | 'usageUnit'
    | 'externalRef'
    | 'notes',
    string
  >;
  noServiceMatch: boolean;
  providerHint: string | null;
  /** Verified sender domain this bill came from, offered as "trust for this service". */
  trustSender?: string | null;
}) {
  const t = useTranslations('review.form');
  const [serviceId, setServiceId] = useState(initial.serviceId);
  return (
    <ActionForm action={approveReviewAction} submitLabel={t('approve')}>
      {(errors) => (
        <Card className="flex flex-col gap-4">
          <input type="hidden" name="documentId" value={documentId} />
          {noServiceMatch && (
            <p className="rounded-xl bg-warning/10 px-4 py-3 text-sm text-warning">
              {t('noServiceMatch', { provider: providerHint ?? '' })}
            </p>
          )}
          <Field label={t('service')} error={errors.serviceId}>
            <Select
              name="serviceId"
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
            >
              {services.length === 0 && <option value="">{t('noServices')}</option>}
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.provider}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('amount', { currency })} error={errors.amount}>
              <Input name="amount" inputMode="decimal" defaultValue={initial.amount} required />
            </Field>
            <Field label={t('externalRef')} error={errors.externalRef}>
              <Input name="externalRef" defaultValue={initial.externalRef} />
            </Field>
            <Field label={t('tax')} error={errors.tax}>
              <Input name="tax" inputMode="decimal" defaultValue={initial.tax} />
            </Field>
            <Field label={t('taxLabel')}>
              <Input name="taxLabel" defaultValue={initial.taxLabel} />
            </Field>
            <Field label={t('periodStart')} error={errors.periodStart}>
              <Input name="periodStart" type="date" defaultValue={initial.periodStart} required />
            </Field>
            <Field label={t('periodEnd')} error={errors.periodEnd}>
              <Input name="periodEnd" type="date" defaultValue={initial.periodEnd} required />
            </Field>
            <Field label={t('issueDate')} error={errors.issueDate}>
              <Input name="issueDate" type="date" defaultValue={initial.issueDate} />
            </Field>
            <Field label={t('dueDate')} error={errors.dueDate}>
              <Input name="dueDate" type="date" defaultValue={initial.dueDate} required />
            </Field>
            <Field label={t('usageQuantity')} error={errors.usageQuantity}>
              <Input
                name="usageQuantity"
                inputMode="decimal"
                defaultValue={initial.usageQuantity}
              />
            </Field>
            <Field label={t('usageUnit')}>
              <Select name="usageUnit" defaultValue={initial.usageUnit}>
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
          {trustSender && (
            <label className="flex items-start gap-3 text-sm font-medium">
              <input
                type="checkbox"
                name="trustSender"
                defaultChecked
                className="mt-0.5 size-5 accent-accent"
              />
              <span>
                {t('trustSender', { domain: trustSender })}
                <span className="block text-xs font-normal text-fg-muted">
                  {t('trustSenderHint', { domain: trustSender })}
                </span>
              </span>
            </label>
          )}
        </Card>
      )}
    </ActionForm>
  );
}
