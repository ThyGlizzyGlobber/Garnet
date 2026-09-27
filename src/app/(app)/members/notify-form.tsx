'use client';

import { useTranslations } from 'next-intl';
import { ActionForm, type FormAction } from '@/components/ui/form';

export function NotifyForm({
  action,
  initial,
}: {
  action: FormAction;
  initial: { bills: boolean; reminders: boolean; problems: boolean };
}) {
  const t = useTranslations('notify.prefs');
  return (
    <ActionForm action={action} submitLabel={t('save')}>
      {() => (
        <div className="flex flex-col gap-3">
          {(['bills', 'reminders', 'problems'] as const).map((k) => (
            <label key={k} className="flex items-center gap-3 text-sm font-medium">
              <input
                type="checkbox"
                name={k}
                defaultChecked={initial[k]}
                className="size-5 accent-accent"
              />
              {t(k)}
            </label>
          ))}
        </div>
      )}
    </ActionForm>
  );
}
