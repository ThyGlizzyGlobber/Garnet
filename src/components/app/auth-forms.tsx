'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button, Field, Input } from '@/components/ui';
import { ActionForm, type FormAction } from '@/components/ui/form';
import { cx } from '@/components/ui/cx';
import { CodeBoxes, PinEntry } from './pieces-client';

/** Email → one-time code. */
export function EmailForm({ action, next }: { action: FormAction; next: string }) {
  const t = useTranslations('login');
  return (
    <ActionForm action={action} submitLabel={t('sendCode')} hideSubmit className="auth-form">
      {(errors, pending) => (
        <>
          <input type="hidden" name="next" value={next} />
          <Field label={t('email')} error={errors.email}>
            <Input name="email" type="email" autoComplete="email" inputMode="email" required />
          </Field>
          <Button type="submit" className="wide" disabled={pending}>
            {pending ? '…' : t('sendCode')}
          </Button>
        </>
      )}
    </ActionForm>
  );
}

/** The six boxes for the emailed code. */
export function CodeForm({ action }: { action: FormAction }) {
  const t = useTranslations('code');
  return (
    <ActionForm action={action} submitLabel={t('submit')} hideSubmit className="auth-form">
      {(errors, pending) => (
        <>
          <CodeBoxes label={t('code')} />
          {errors.code && (
            <p role="alert" className="fld-h bad-text">
              {errors.code}
            </p>
          )}
          <Button type="submit" className="wide" disabled={pending}>
            {pending ? '…' : t('submit')}
          </Button>
        </>
      )}
    </ActionForm>
  );
}

/** A single PIN on the keypad (unlock, the legacy claim). */
export function PinForm({
  action,
  label,
  submitLabel,
  hidden = {},
}: {
  action: FormAction;
  label: string;
  submitLabel: string;
  hidden?: Record<string, string>;
}) {
  return (
    <ActionForm action={action} submitLabel={submitLabel} hideSubmit className="auth-form">
      {(errors, pending) => (
        <>
          {Object.entries(hidden).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <PinEntry name="pin" label={label} />
          {errors.pin && (
            <p role="alert" className="fld-h bad-text t-center">
              {errors.pin}
            </p>
          )}
          <Button type="submit" className="wide" disabled={pending}>
            {pending ? '…' : submitLabel}
          </Button>
        </>
      )}
    </ActionForm>
  );
}

function PinInput({ name, autoFocus }: { name: string; autoFocus?: boolean }) {
  return (
    <Input
      name={name}
      type="password"
      inputMode="numeric"
      pattern="\d{4,8}"
      autoComplete={name === 'pin' ? 'current-password' : 'new-password'}
      autoFocus={autoFocus}
      required
    />
  );
}

/**
 * A new PIN and its confirmation: the keypad for the first PIN (set-pin),
 * or plain fields with the current PIN first (Change PIN in Settings).
 */
export function NewPinForm({
  action,
  withCurrent = false,
}: {
  action: FormAction;
  withCurrent?: boolean;
}) {
  const t = useTranslations('pin');
  return (
    <ActionForm
      action={action}
      submitLabel={withCurrent ? t('change') : t('save')}
      hideSubmit={!withCurrent}
      className={withCurrent ? undefined : 'auth-form'}
    >
      {(errors, pending) =>
        withCurrent ? (
          <>
            <Field label={t('current')} error={errors.current}>
              <PinInput name="current" />
            </Field>
            <Field label={t('newPin')} hint={t('pinHint')} error={errors.pin}>
              <Input
                name="pin"
                type="password"
                inputMode="numeric"
                pattern="\d{4,8}"
                autoComplete="new-password"
                required
              />
            </Field>
            <Field label={t('pinConfirm')} error={errors.pinConfirm}>
              <PinInput name="pinConfirm" />
            </Field>
          </>
        ) : (
          <>
            <PinEntry name="pin" label={t('pin')} />
            {errors.pin && (
              <p role="alert" className="fld-h bad-text t-center">
                {errors.pin}
              </p>
            )}
            <Field label={t('pinConfirm')} hint={t('pinHint')} error={errors.pinConfirm}>
              <PinInput name="pinConfirm" />
            </Field>
            <Button type="submit" className="wide" disabled={pending}>
              {pending ? '…' : t('save')}
            </Button>
          </>
        )
      }
    </ActionForm>
  );
}

/** The invite code and Join, on one row. */
export function JoinCodeForm({ action }: { action: FormAction }) {
  const t = useTranslations('welcome.join');
  return (
    <ActionForm action={action} submitLabel={t('cta')} hideSubmit className="join-form">
      {(errors, pending) => (
        <>
          <span className="join-row">
            <Input
              name="code"
              placeholder={t('placeholder')}
              autoCapitalize="characters"
              autoComplete="off"
              className="mono"
              aria-label={t('code')}
              required
            />
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? '…' : t('cta')}
            </Button>
          </span>
          {errors.code && (
            <span role="alert" className="fld-h bad-text">
              {errors.code}
            </span>
          )}
        </>
      )}
    </ActionForm>
  );
}

/** Demo households: pick a fictional member and enter the demo PIN. */
export function DemoForm({
  action,
  members,
}: {
  action: FormAction;
  members: { id: string; name: string }[];
}) {
  const t = useTranslations('login.demo');
  const [selected, setSelected] = useState(members[0]?.id ?? '');
  return (
    <ActionForm action={action} submitLabel={t('submit')} hideSubmit className="auth-form">
      {(errors, pending) => (
        <>
          <fieldset className="fld">
            <legend className="fld-l">{t('who')}</legend>
            <div className="tp-list">
              {members.map((m) => (
                <label key={m.id}>
                  <input
                    type="radio"
                    name="memberId"
                    value={m.id}
                    checked={selected === m.id}
                    onChange={() => setSelected(m.id)}
                  />
                  <span className={cx('chip-btn', selected === m.id && 'on')}>{m.name}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <Field label={t('pin')} error={errors.pin}>
            <PinInput name="pin" />
          </Field>
          <Button type="submit" variant="secondary" className="wide" disabled={pending}>
            {pending ? '…' : t('submit')}
          </Button>
        </>
      )}
    </ActionForm>
  );
}
