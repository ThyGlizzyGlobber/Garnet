'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

/** "Forward bills to <address> · Copy": the one thing every member needs to know. */
export function ForwardAddress({ address }: { address: string }) {
  const t = useTranslations('billsAddress');
  const tc = useTranslations('members.invite');
  const [copied, setCopied] = useState(false);
  return (
    <div className="glass mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl px-4 py-3 text-sm">
      <span className="text-fg-muted">{t('short')}</span>
      <span className="min-w-0 font-mono text-xs break-all text-fg">{address}</span>
      <button
        type="button"
        className="rounded-full bg-surface-2 px-3 py-1 text-xs font-semibold hover:text-accent"
        onClick={() => {
          void navigator.clipboard?.writeText(address).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        {copied ? tc('copied') : tc('copy')}
      </button>
    </div>
  );
}
