'use client';

import { Fragment, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button, Select } from '@/components/ui';
import { SectionHead } from '@/components/ui/blocks';
import { ActionForm, type FormAction } from '@/components/ui/form';

/** One place a bill can go: a service (svc:<id>) or a sub-service not set up yet (type:<slug>). */
interface MoveOption {
  value: string;
  name: string;
  /** Its bills are filed under vehicles or policies. */
  kind: 'vehicle' | null;
}

/** Where a bill can go: groups of services (a main service's sub-services together). */
export interface MoveTarget {
  label: string;
  options: MoveOption[];
}

/**
 * "Move to": file the bill under another service or sub-service (a Netflix
 * bill that landed on Spotify), and for Vehicles and Health under which
 * vehicle or policy (a rego notice filed under Building insurance goes to
 * Registration · Ford Fiesta). Only services this member may move it to.
 */
export function MoveBill({
  action,
  billId,
  current,
  currentAssetId,
  targets,
  assets,
}: {
  action: FormAction;
  billId: string;
  /** The option it's on now (svc:<id>). */
  current: string;
  currentAssetId: string | null;
  targets: MoveTarget[];
  /** Vehicles this member sees ("Yours" already in the name). */
  assets: { id: string; name: string; kind: 'vehicle' }[];
}) {
  const t = useTranslations('bills.move');
  const ta = useTranslations('main');
  const [value, setValue] = useState(current);
  const kind = targets.flatMap((g) => g.options).find((o) => o.value === value)?.kind ?? null;
  const choices = kind ? assets.filter((a) => a.kind === kind) : [];
  const option = (o: MoveOption) => (
    <option key={o.value} value={o.value}>
      {o.name}
    </option>
  );
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
              name="target"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              aria-label={t('label')}
              className="min-w-0 flex-1"
            >
              {targets.map((g, i) =>
                g.label ? (
                  <optgroup key={i} label={g.label}>
                    {g.options.map(option)}
                  </optgroup>
                ) : (
                  <Fragment key={i}>{g.options.map(option)}</Fragment>
                ),
              )}
            </Select>
            {kind && choices.length > 0 && (
              <Select
                key={kind}
                name="assetId"
                defaultValue={
                  choices.some((a) => a.id === currentAssetId) ? (currentAssetId ?? '') : ''
                }
                aria-label={ta('vehicle.label')}
                className="min-w-0 flex-1"
              >
                <option value="">{ta('vehicle.none')}</option>
                {choices.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            )}
            <Button type="submit" variant="secondary" icon="arrow-right" disabled={pending}>
              {pending ? '…' : t('button')}
            </Button>
          </div>
          {errors.target && <span className="fld-h bad-text">{errors.target}</span>}
        </>
      )}
    </ActionForm>
  );
}
