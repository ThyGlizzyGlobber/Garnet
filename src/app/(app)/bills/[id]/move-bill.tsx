'use client';

import { Fragment } from 'react';
import { useTranslations } from 'next-intl';
import { Button, Select } from '@/components/ui';
import { SectionHead } from '@/components/ui/blocks';
import { ActionForm, type FormAction } from '@/components/ui/form';

/** Where a bill can go: groups of services (a main service's sub-services together). */
export interface MoveTarget {
  label: string;
  options: { id: string; name: string }[];
}

/**
 * "Move to": file the bill under another service or sub-service (a Netflix
 * bill that landed on Spotify). Only services this member may move it to.
 */
export function MoveBill({
  action,
  billId,
  currentId,
  targets,
}: {
  action: FormAction;
  billId: string;
  currentId: string;
  targets: MoveTarget[];
}) {
  const t = useTranslations('bills.move');
  return (
    <ActionForm
      action={action}
      submitLabel={t('button')}
      hideSubmit
      className="flex flex-col gap-3"
    >
      {(errors, pending) => (
        <>
          <SectionHead title={t('title')} />
          <p className="muted small">{t('body')}</p>
          <input type="hidden" name="id" value={billId} />
          <div className="flex flex-wrap items-center gap-2">
            <Select
              name="serviceId"
              defaultValue={currentId}
              aria-label={t('label')}
              className="min-w-0 flex-1"
            >
              {targets.map((g, i) =>
                g.label ? (
                  <optgroup key={i} label={g.label}>
                    {g.options.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </optgroup>
                ) : (
                  <Fragment key={i}>
                    {g.options.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </Fragment>
                ),
              )}
            </Select>
            <Button type="submit" variant="secondary" icon="arrow-right" disabled={pending}>
              {pending ? '…' : t('button')}
            </Button>
          </div>
          {errors.serviceId && <span className="fld-h bad-text">{errors.serviceId}</span>}
        </>
      )}
    </ActionForm>
  );
}
