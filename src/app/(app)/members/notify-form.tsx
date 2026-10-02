'use client';

import { useTranslations } from 'next-intl';
import { Toggle } from '@/components/ui/controls';
import { ActionForm, type FormAction } from '@/components/ui/form';

/** Which emails this person gets: a switch per kind, saved with one button. */
export function NotifyForm({
  action,
  initial,
  memberId,
}: {
  action: FormAction;
  initial: { bills: boolean; reminders: boolean; problems: boolean };
  /** Whose preferences, from the account area (one of the person's households); this household's otherwise. */
  memberId?: string;
}) {
  const t = useTranslations('notify.prefs');
  return (
    <ActionForm action={action} submitLabel={t('save')} className="grid">
      {() => (
        <>
          {memberId && <input type="hidden" name="memberId" value={memberId} />}
          {(['bills', 'reminders', 'problems'] as const).map((k) => (
            <div key={k} className="tg-row">
              <span>
                <b>{t(`${k}Title`)}</b>
                <span className="muted small">{t(`${k}Sub`)}</span>
              </span>
              <Toggle name={k} label={t(`${k}Title`)} defaultChecked={initial[k]} />
            </div>
          ))}
        </>
      )}
    </ActionForm>
  );
}
