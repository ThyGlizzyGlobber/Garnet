'use client';

import { useTranslations } from 'next-intl';
import { Icon } from '@/components/app/icons';
import { Input } from '@/components/ui';
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

/** A read-only value (an invitation link, a bills address) with a Copy button. */
export function CopyField({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      <div className="flex gap-2">
        <Input
          readOnly
          value={value}
          className={mono ? 'font-mono tracking-widest' : 'text-sm'}
          onFocus={(e) => e.currentTarget.select()}
        />
        <CopyButton value={value} className="btn btn-glass" />
      </div>
    </div>
  );
}
