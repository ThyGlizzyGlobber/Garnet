'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Icon } from '@/components/app/icons';
import { Button, Field, Input, LinkButton, Select, Textarea } from '@/components/ui';
import { SectionHead } from '@/components/ui/blocks';
import { Chip } from '@/components/ui/chip';
import { ActionForm } from '@/components/ui/form';
import { approveReviewAction, ignoreDocumentAction } from '../actions';

type Values = Record<
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

/**
 * What the document says, as fields: each one the reader filled is plain,
 * each one it couldn't read is marked to check. Create bill, or Not a bill.
 */
export function ReviewForm({
  documentId,
  services,
  units,
  currency,
  initial,
  read,
  noServiceMatch,
  providerHint,
  trustSender,
  canIgnore,
}: {
  documentId: string;
  services: { id: string; name: string; provider: string; usageUnit: string | null }[];
  units: { key: string; label: string }[];
  currency: string;
  initial: Values;
  /** Whether the document was analysed at all (fields came from it). */
  read: boolean;
  noServiceMatch: boolean;
  providerHint: string | null;
  /** Verified sender domain this bill came from, offered as "trust for this service". */
  trustSender?: string | null;
  /** Still waiting: may be filed as not a bill. */
  canIgnore?: boolean;
}) {
  const t = useTranslations('review.form');
  const tc = useTranslations('review.confirm');
  const tu = useTranslations('ui.doc');
  const [serviceId, setServiceId] = useState(initial.serviceId);
  const svcName = services.find((s) => s.id === serviceId)?.name ?? '';
  const check = (v: string) =>
    read && !v
      ? { state: 'warn' as const, hint: tc('missing') }
      : { state: undefined, hint: undefined };
  const okHint = (
    <>
      <Icon name="check" width={12} height={12} /> {tc('matched', { service: svcName })}
    </>
  );
  return (
    <ActionForm
      action={approveReviewAction}
      submitLabel={t('approve')}
      hideSubmit
      className="form-main"
    >
      {(errors, pending) => (
        <>
          <input type="hidden" name="documentId" value={documentId} />
          <SectionHead
            title={tc('says')}
            right={
              read ? (
                <Chip tone="analysed" icon="check">
                  {tu('analysed')}
                </Chip>
              ) : undefined
            }
          />
          <Field
            label={t('service')}
            error={errors.serviceId}
            state={noServiceMatch ? 'warn' : read ? 'ok' : undefined}
            hint={
              noServiceMatch
                ? t('noServiceMatch', { provider: providerHint ?? '' })
                : read
                  ? okHint
                  : undefined
            }
          >
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
          <div className="fld-row">
            <Field
              label={t('amount', { currency })}
              error={errors.amount}
              {...check(initial.amount)}
            >
              <Input name="amount" inputMode="decimal" defaultValue={initial.amount} required />
            </Field>
            <Field label={t('dueDate')} error={errors.dueDate} {...check(initial.dueDate)}>
              <Input name="dueDate" type="date" defaultValue={initial.dueDate} required />
            </Field>
          </div>
          <div className="fld-row">
            <Field
              label={t('periodStart')}
              error={errors.periodStart}
              {...check(initial.periodStart)}
            >
              <Input name="periodStart" type="date" defaultValue={initial.periodStart} required />
            </Field>
            <Field label={t('periodEnd')} error={errors.periodEnd} {...check(initial.periodEnd)}>
              <Input name="periodEnd" type="date" defaultValue={initial.periodEnd} required />
            </Field>
          </div>
          <div className="fld-row">
            <Field label={t('issueDate')} error={errors.issueDate} optional>
              <Input name="issueDate" type="date" defaultValue={initial.issueDate} />
            </Field>
            <Field label={t('externalRef')} error={errors.externalRef} optional>
              <Input name="externalRef" defaultValue={initial.externalRef} className="mono" />
            </Field>
          </div>
          <div className="fld-row">
            <Field label={t('usageQuantity')} error={errors.usageQuantity} optional>
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
          <div className="fld-row">
            <Field label={t('tax')} error={errors.tax} optional>
              <Input name="tax" inputMode="decimal" defaultValue={initial.tax} />
            </Field>
            <Field label={t('taxLabel')}>
              <Input name="taxLabel" defaultValue={initial.taxLabel} />
            </Field>
          </div>
          <Field label={t('notes')} optional>
            <Textarea name="notes" defaultValue={initial.notes} rows={2} />
          </Field>
          {trustSender && (
            <label className="check">
              <input type="checkbox" name="trustSender" defaultChecked />
              <span>
                <b>{t('trustSender', { domain: trustSender })}</b>
                <span className="muted small">
                  {' '}
                  {t('trustSenderHint', { domain: trustSender })}
                </span>
              </span>
            </label>
          )}
          <div className="form-acts">
            <Button type="submit" icon="check" disabled={pending}>
              {pending ? '…' : t('approve')}
            </Button>
            {canIgnore && (
              <Button
                type="submit"
                variant="secondary"
                formAction={ignoreDocumentAction}
                formNoValidate
                onClick={(e) => {
                  if (!window.confirm(tc('notABillConfirm'))) e.preventDefault();
                }}
              >
                {tc('notABill')}
              </Button>
            )}
            <LinkButton
              href={`/api/documents/${documentId}/file`}
              target="_blank"
              rel="noreferrer"
              variant="ghost"
              icon="eye"
            >
              {tc('viewFile')}
            </LinkButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}
