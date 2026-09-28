import { getTranslations } from 'next-intl/server';
import { CopyField } from '@/components/app/auth-forms';
import { Card } from '@/components/ui';
import { InlineAction } from '@/components/ui/form';

/** The household's bills email address, with what to do with it. */
export async function BillsAddressCard({
  address,
  replaceAction,
}: {
  address: string;
  /** Admins only. */
  replaceAction?: (fd: FormData) => Promise<void>;
}) {
  const t = await getTranslations('billsAddress');
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="font-display font-semibold">{t('title')}</h2>
      <p className="text-sm text-fg-muted">{t('body')}</p>
      <CopyField label={t('label')} value={address} />
      <ul className="list-disc space-y-1 pl-5 text-xs text-fg-muted">
        <li>{t('howForward')}</li>
        <li>{t('howTrust')}</li>
        <li>{t('howReview')}</li>
      </ul>
      {replaceAction && (
        <div>
          <InlineAction
            action={replaceAction}
            label={t('replace')}
            variant="ghost"
            confirm={t('replaceConfirm')}
          />
        </div>
      )}
    </Card>
  );
}
