'use client';

import { useActionState, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Icon } from '@/components/app/icons';
import { Button } from '@/components/ui';
import type { ActionState } from '@/components/ui/form';
import { removePhotoAction, saveNameAction, savePhotoAction } from './actions';

/** Your name, saved to every household you belong to. */
export function NameForm({ initial }: { initial: string }) {
  const t = useTranslations('profile.name');
  const [state, action, pending] = useActionState<ActionState, FormData>(saveNameAction, {});
  const error = state.fieldErrors?.name;
  return (
    <form action={action} className="pf-name">
      <input
        className="inp-plain"
        name="name"
        defaultValue={initial}
        maxLength={40}
        required
        aria-label={t('label')}
        aria-invalid={!!error}
      />
      <Button type="submit" size="sm" variant="secondary" disabled={pending}>
        {pending ? t('saving') : t('save')}
      </Button>
      {(error || state.note) && (
        <p className={`pf-msg small${error ? ' bad' : ''}`} role={error ? 'alert' : 'status'}>
          {error ?? state.note}
        </p>
      )}
    </form>
  );
}

/** Change or remove the profile photo: picking a file uploads it at once. */
export function PhotoButtons({ hasPhoto }: { hasPhoto: boolean }) {
  const t = useTranslations('profile.photo');
  const [state, action, pending] = useActionState<ActionState, FormData>(savePhotoAction, {});
  const form = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="pf-photo-acts">
      <form ref={form} action={action}>
        <input
          ref={input}
          type="file"
          name="photo"
          accept="image/jpeg,image/png,image/webp,image/gif"
          hidden
          onChange={() => form.current?.requestSubmit()}
        />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          icon="upload"
          disabled={pending}
          onClick={() => input.current?.click()}
        >
          {pending ? t('uploading') : hasPhoto ? t('change') : t('add')}
        </Button>
      </form>
      {hasPhoto && (
        <form action={removePhotoAction}>
          <Button type="submit" size="sm" variant="ghost">
            {t('remove')}
          </Button>
        </form>
      )}
      {state.error && (
        <p className="pf-msg small bad" role="alert">
          <Icon name="alert" width={13} height={13} /> {state.error}
        </p>
      )}
    </div>
  );
}
