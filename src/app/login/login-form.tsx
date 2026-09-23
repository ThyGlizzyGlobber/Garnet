'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Card, Field, Input } from '@/components/ui';
import { ActionForm } from '@/components/ui/form';
import { login } from './actions';

export function LoginForm({
  members,
}: {
  members: { id: string; name: string; colour: string }[];
}) {
  const t = useTranslations('login');
  const [selected, setSelected] = useState(members[0]?.id ?? '');
  return (
    <ActionForm action={login} submitLabel={t('submit')}>
      {() => (
        <Card className="flex flex-col gap-4">
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
            <Input
              name="pin"
              type="password"
              inputMode="numeric"
              pattern="\d{4,8}"
              autoComplete="current-password"
              autoFocus
              required
            />
          </Field>
        </Card>
      )}
    </ActionForm>
  );
}
