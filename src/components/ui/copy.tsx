'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui';

function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}

/** "Copy" that says "Copied" for a moment once the value is on the clipboard. */
export function CopyButton({ value, className }: { value: string; className?: string }) {
  const t = useTranslations('common');
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={cx(
        'shrink-0 rounded-full bg-surface-2 font-semibold hover:text-accent',
        className ?? 'px-4 text-sm',
      )}
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? t('copied') : t('copy')}
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
        <CopyButton value={value} />
      </div>
    </div>
  );
}
