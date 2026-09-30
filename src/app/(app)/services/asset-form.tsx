'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button, Card, Field, Input, LinkButton, Select } from '@/components/ui';
import { SectionHead } from '@/components/ui/blocks';
import { Segmented } from '@/components/ui/controls';
import { ActionForm, type FormAction } from '@/components/ui/form';

/**
 * Adding or changing a vehicle, on its own page: what the household calls
 * it, its plate or VIN (bills that print it are filed under it by
 * themselves), and whose it is when others live there.
 */
export function VehicleForm({
  action,
  vehicle,
  whose,
  cancelHref,
}: {
  action: FormAction;
  /** Editing: the one being changed. */
  vehicle?: { id: string; name: string; identifier: string | null; mine: boolean };
  /** Offer "Just mine": others live there. */
  whose: boolean;
  cancelHref: string;
}) {
  const t = useTranslations('main.vehicle');
  const [owner, setOwner] = useState(vehicle?.mine ? 'mine' : 'household');
  return (
    <ActionForm action={action} submitLabel="" hideSubmit className="form-scr">
      {(errors, pending) => (
        <Card className="vform">
          <SectionHead title={t('details')} />
          {vehicle && <input type="hidden" name="id" value={vehicle.id} />}
          <Field label={t('name')} error={errors.name}>
            <Input
              name="name"
              required
              maxLength={60}
              defaultValue={vehicle?.name}
              placeholder={t('namePlaceholder')}
            />
          </Field>
          <Field
            label={t('identifier')}
            optional
            hint={t('identifierHint')}
            error={errors.identifier}
          >
            <Input
              name="identifier"
              maxLength={40}
              defaultValue={vehicle?.identifier ?? ''}
              className="mono"
              autoCapitalize="characters"
              autoComplete="off"
            />
          </Field>
          {whose && (
            <div className="fld">
              <span className="fld-l">{t('whose')}</span>
              <input type="hidden" name="whose" value={owner} />
              <Segmented
                small
                value={owner}
                label={t('whose')}
                onChange={setOwner}
                items={[
                  { value: 'household', label: t('whoseHousehold'), icon: 'users' },
                  { value: 'mine', label: t('whoseMine'), icon: 'user' },
                ]}
              />
            </div>
          )}
          <div className="form-acts">
            <Button type="submit" disabled={pending} icon={vehicle ? 'check' : 'plus'}>
              {pending ? '…' : vehicle ? t('save') : t('add')}
            </Button>
            <LinkButton href={cancelHref} variant="ghost">
              {t('cancel')}
            </LinkButton>
          </div>
        </Card>
      )}
    </ActionForm>
  );
}

/**
 * "Which vehicle?" beside a bill not filed under one yet: pick one and it's
 * filed there (moving to the vehicle's side when it's someone's own).
 */
export function FileBillForm({
  action,
  billId,
  assets,
  back,
}: {
  action: FormAction;
  billId: string;
  assets: { id: string; name: string }[];
  back: string;
}) {
  const t = useTranslations('main.vehicle');
  return (
    <ActionForm action={action} submitLabel="" hideSubmit className="asset-file">
      {(errors, pending) => (
        <>
          <input type="hidden" name="billId" value={billId} />
          <input type="hidden" name="back" value={back} />
          <Select name="assetId" defaultValue="" aria-label={t('which')} required>
            <option value="" disabled>
              {t('which')}
            </option>
            {assets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="secondary" size="sm" disabled={pending}>
            {pending ? '…' : t('file')}
          </Button>
          {errors.assetId && <span className="fld-h bad-text">{errors.assetId}</span>}
        </>
      )}
    </ActionForm>
  );
}
