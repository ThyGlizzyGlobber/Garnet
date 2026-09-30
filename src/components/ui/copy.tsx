'use client';

import { useTranslations } from 'next-intl';
import { Icon } from '@/components/app/icons';
import { cx } from './cx';
import { useToast } from './toast';

/** "Copy": puts the value on the clipboard and says so in a toast. */
export function CopyButton({
  value,
  label,
  className,
}: {
  value: string;
  /** The button's text; "Copy" by default. */
  label?: string;
  /** Replaces the default small glass button look. */
  className?: string;
}) {
  const t = useTranslations('common');
  const toast = useToast();
  return (
    <button
      type="button"
      className={cx('shrink-0', className ?? 'btn btn-glass btn-sm')}
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => toast(t('copied')));
      }}
    >
      <Icon name="copy" width={15} height={15} />
      <span>{label ?? t('copy')}</span>
    </button>
  );
}
