'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Field, Input } from '@/components/ui';
import { ActionForm, type FormAction } from '@/components/ui/form';

/** Email → one-time code. */
export function EmailForm({ action, next }: { action: FormAction; next: string }) {
  const t = useTranslations('login');
  return (
    <ActionForm action={action} submitLabel={t('sendCode')}>
      {(errors) => (
        <>
          <input type="hidden" name="next" value={next} />
          <Field label={t('email')} error={errors.email}>
            <Input name="email" type="email" autoComplete="email" inputMode="email" required />
          </Field>
        </>
      )}
    </ActionForm>
  );
}

export function CodeForm({ action }: { action: FormAction }) {
  const t = useTranslations('code');
  return (
    <ActionForm action={action} submitLabel={t('submit')}>
      {(errors) => (
        <Field label={t('code')} error={errors.code}>
          <Input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            className="font-mono text-2xl tracking-[0.4em]"
            autoFocus
            required
          />
        </Field>
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

/** A single PIN field (unlock, legacy claim). */
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
    <ActionForm action={action} submitLabel={submitLabel}>
      {(errors) => (
        <>
          {Object.entries(hidden).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <Field label={label} error={errors.pin}>
            <PinInput name="pin" autoFocus />
          </Field>
        </>
      )}
    </ActionForm>
  );
}

/** New PIN + confirmation (first PIN, or change with the current one). */
export function NewPinForm({
  action,
  withCurrent = false,
}: {
  action: FormAction;
  withCurrent?: boolean;
}) {
  const t = useTranslations('pin');
  return (
    <ActionForm action={action} submitLabel={withCurrent ? t('change') : t('save')}>
      {(errors) => (
        <>
          {withCurrent && (
            <Field label={t('current')} error={errors.current}>
              <PinInput name="current" />
            </Field>
          )}
          <Field
            label={withCurrent ? t('newPin') : t('pin')}
            hint={t('pinHint')}
            error={errors.pin}
          >
            <Input
              name="pin"
              type="password"
              inputMode="numeric"
              pattern="\d{4,8}"
              autoComplete="new-password"
              autoFocus={!withCurrent}
              required
            />
          </Field>
          <Field label={t('pinConfirm')} error={errors.pinConfirm}>
            <PinInput name="pinConfirm" />
          </Field>
        </>
      )}
    </ActionForm>
  );
}

export function JoinCodeForm({ action }: { action: FormAction }) {
  const t = useTranslations('welcome.join');
  return (
    <ActionForm action={action} submitLabel={t('cta')}>
      {(errors) => (
        <Field label={t('code')} error={errors.code}>
          <Input
            name="code"
            placeholder={t('placeholder')}
            autoCapitalize="characters"
            autoComplete="off"
            className="font-mono uppercase tracking-widest"
            required
          />
        </Field>
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
    <ActionForm action={action} submitLabel={t('submit')}>
      {() => (
        <>
          <fieldset>
            <legend className="mb-1.5 block text-sm font-medium">{t('who')}</legend>
            <div className="flex flex-wrap gap-2">
              {members.map((m) => (
                <label
                  key={m.id}
                  className={`cursor-pointer rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${
                    selected === m.id
                      ? 'border-accent bg-accent text-accent-fg'
                      : 'border-border bg-surface-2'
                  }`}
                >
                  <input
                    type="radio"
                    name="memberId"
                    value={m.id}
                    checked={selected === m.id}
                    onChange={() => setSelected(m.id)}
                    className="sr-only"
                  />
                  {m.name}
                </label>
              ))}
            </div>
          </fieldset>
          <Field label={t('pin')}>
            <PinInput name="pin" />
          </Field>
        </>
      )}
    </ActionForm>
  );
}
