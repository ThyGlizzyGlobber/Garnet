'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button, Field, Input, Select } from '@/components/ui';
import { Segmented } from '@/components/ui/controls';
import { ActionForm, type FormAction } from '@/components/ui/form';

/**
 * Adding or changing a vehicle or policy: what the household calls it, its
 * plate or policy number (bills that print it are filed under it by
 * themselves), and whose it is when others live there.
 */
export function AssetForm({
  action,
  kind,
  asset,
  whose,
}: {
  action: FormAction;
  kind: 'vehicle' | 'policy';
  /** Editing: the one being changed. */
  asset?: { id: string; name: string; identifier: string | null; mine: boolean };
  /** Offer "Just mine": others live there (and, editing, it may change hands). */
  whose: boolean;
}) {
  const t = useTranslations('assets');
  const [owner, setOwner] = useState(asset?.mine ? 'mine' : 'household');
  return (
    <ActionForm action={action} submitLabel="" hideSubmit className="asset-form">
      {(errors, pending) => (
        <>
          <input type="hidden" name="kind" value={kind} />
          {asset && <input type="hidden" name="id" value={asset.id} />}
          <Field label={t(`${kind}.name`)} error={errors.name}>
            <Input
              name="name"
              required
              maxLength={60}
              defaultValue={asset?.name}
              placeholder={t(`${kind}.namePlaceholder`)}
            />
          </Field>
          <Field
            label={t(`${kind}.identifier`)}
            optional
            hint={t(`${kind}.identifierHint`)}
            error={errors.identifier}
          >
            <Input
              name="identifier"
              maxLength={40}
              defaultValue={asset?.identifier ?? ''}
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
          <div>
            <Button type="submit" disabled={pending} icon={asset ? 'check' : 'plus'}>
              {pending ? '…' : asset ? t('save') : t(`${kind}.add`)}
            </Button>
          </div>
        </>
      )}
    </ActionForm>
  );
}

/**
 * "Which vehicle?" beside a bill waiting under "No vehicle yet": pick one
 * and it's filed there (moving to the vehicle's side when it's someone's own).
 */
export function FileBillForm({
  action,
  billId,
  kind,
  assets,
  back,
}: {
  action: FormAction;
  billId: string;
  kind: 'vehicle' | 'policy';
  assets: { id: string; name: string }[];
  back: string;
}) {
  const t = useTranslations('assets');
  return (
    <ActionForm action={action} submitLabel="" hideSubmit className="asset-file">
      {(errors, pending) => (
        <>
          <input type="hidden" name="billId" value={billId} />
          <input type="hidden" name="back" value={back} />
          <Select name="assetId" defaultValue="" aria-label={t(`${kind}.which`)} required>
            <option value="" disabled>
              {t(`${kind}.which`)}
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
