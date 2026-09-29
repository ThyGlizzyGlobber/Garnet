import { getTranslations } from 'next-intl/server';
import { CopyButton } from '@/components/ui/copy';

/** "Forward bills to <address> · Copy": the one thing every member needs to know. */
export async function ForwardAddress({ address }: { address: string }) {
  const t = await getTranslations('billsAddress');
  return (
    <div className="glass mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl px-4 py-3 text-sm">
      <span className="text-fg-muted">{t('short')}</span>
      <span className="min-w-0 font-mono text-xs break-all text-fg">{address}</span>
      <CopyButton value={address} className="px-3 py-1 text-xs" />
    </div>
  );
}
