'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { SwatchPick } from '@/components/app/pieces-client';
import { Button, Card, Field, Input, LinkButton, Select } from '@/components/ui';
import { SectionHead } from '@/components/ui/blocks';
import { ActionForm, type FormAction } from '@/components/ui/form';

export interface MemberFormValues {
  id?: string;
  name: string;
  splitWeight: string;
  activeFrom: string;
  activeTo: string;
  colour: string;
  paymentDetails: { label: string; value: string }[];
  email: string;
  /** Joined members sign in with their account; their email isn't edited here. */
  joined: boolean;
  role: string;
}

/**
 * A member's details: name, colour, when they moved in and out, and how to
 * pay them back. `side` holds the cards beside it (role, access, remove),
 * which carry their own actions.
 */
export function MemberForm({
  action,
  initial,
  sharedHousehold,
  canEditResidency = true,
  roles = [],
  submitLabel,
  cancelHref,
  side,
  nameLocked,
}: {
  action: FormAction;
  initial: MemberFormValues;
  sharedHousehold: boolean;
  /** Move-in, move-out and split weight decide shares, so only admins change them. */
  canEditResidency?: boolean;
  /** The housemate roles this household's type allows (admins pick; empty hides the field). */
  roles?: { value: string; label: string }[];
  submitLabel: string;
  cancelHref: string;
  side?: ReactNode;
  /**
   * A joined member's name is theirs (owner, 2026-10-02): changed only by
   * them, on their Profile, for every household. When set, the name shows
   * read-only with this line under it.
   */
  nameLocked?: ReactNode;
}) {
  const t = useTranslations('members.form');
  const tc = useTranslations('common');
  const rows = [...initial.paymentDetails, { label: '', value: '' }].slice(0, 6);
  return (
    <div className="form-grid">
      <ActionForm action={action} submitLabel={submitLabel} hideSubmit className="form-main-wrap">
        {(errors, pending) => (
          <>
            {initial.id && <input type="hidden" name="id" value={initial.id} />}
            <Card className="form-main">
              <SectionHead title={t('details')} />
              <div className="fld-row">
                <Field label={t('name')} error={errors.name} hint={nameLocked}>
                  <Input
                    name="name"
                    defaultValue={initial.name}
                    autoComplete="off"
                    required
                    readOnly={!!nameLocked}
                    aria-readonly={!!nameLocked}
                  />
                </Field>
                <div className="fld">
                  <span className="fld-l">{t('colour')}</span>
                  <SwatchPick name="colour" value={initial.colour} label={t('colour')} />
                  <span className="fld-h">{t('colourHint')}</span>
                </div>
              </div>
              {roles.length > 0 ? (
                <Field label={t('role')} hint={t('roleHint')}>
                  <Select name="role" defaultValue={initial.role}>
                    {roles.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : (
                <input type="hidden" name="role" value={initial.role} />
              )}
              {!initial.joined && (
                <Field label={t('email')} error={errors.email} hint={t('emailHint')} optional>
                  <Input
                    name="email"
                    type="email"
                    inputMode="email"
                    autoComplete="off"
                    defaultValue={initial.email}
                  />
                </Field>
              )}
              {canEditResidency ? (
                <div className="fld-row">
                  <Field
                    label={t('activeFrom')}
                    error={errors.activeFrom}
                    hint={t('activeFromHint')}
                  >
                    <Input
                      name="activeFrom"
                      type="date"
                      defaultValue={initial.activeFrom}
                      required
                    />
                  </Field>
                  <Field
                    label={t('activeTo')}
                    error={errors.activeTo}
                    hint={t('activeToHint')}
                    optional
                  >
                    <Input name="activeTo" type="date" defaultValue={initial.activeTo} />
                  </Field>
                </div>
              ) : (
                <>
                  <input type="hidden" name="activeFrom" value={initial.activeFrom} />
                  <input type="hidden" name="activeTo" value={initial.activeTo} />
                </>
              )}
              {canEditResidency && sharedHousehold && initial.splitWeight !== '1' ? (
                <Field
                  label={t('splitWeight')}
                  error={errors.splitWeight}
                  hint={t('splitWeightHint')}
                >
                  <Input
                    name="splitWeight"
                    inputMode="decimal"
                    defaultValue={initial.splitWeight}
                    className="narrow"
                  />
                </Field>
              ) : (
                <input type="hidden" name="splitWeight" value={initial.splitWeight} />
              )}
              {sharedHousehold && (
                <>
                  <SectionHead title={t('paymentDetails')} />
                  <p className="muted small">{t('paymentDetailsHint')}</p>
                  <div className="pay-rows-edit">
                    {rows.map((r, i) => (
                      <div key={i} className="fld-row">
                        <Input
                          name={`pd_label_${i}`}
                          defaultValue={r.label}
                          placeholder={t('pdLabel')}
                          aria-label={t('pdLabel')}
                        />
                        <Input
                          name={`pd_value_${i}`}
                          defaultValue={r.value}
                          placeholder={t('pdValue')}
                          aria-label={t('pdValue')}
                          className="mono"
                        />
                      </div>
                    ))}
                  </div>
                </>
              )}
              <div className="form-acts">
                <Button type="submit" icon="check" disabled={pending}>
                  {pending ? '…' : submitLabel}
                </Button>
                <LinkButton href={cancelHref} variant="ghost">
                  {tc('cancel')}
                </LinkButton>
              </div>
            </Card>
          </>
        )}
      </ActionForm>
      {side && <div className="form-side">{side}</div>}
    </div>
  );
}
