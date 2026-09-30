'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui';
import { CopyButton } from '@/components/ui/copy';
import { Sheet } from '@/components/ui/sheet';
import { Choice } from './pieces';

/**
 * The top bar's Add bill: a sheet asking how the bill is arriving. Forward
 * its email (the household's bills address, with Copy), upload a PDF or
 * photo, or enter it by hand.
 */
export function AddBillButton({
  address,
  className,
}: {
  address: string | null;
  className?: string;
}) {
  const t = useTranslations('addBill');
  const tc = useTranslations('common');
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" icon="plus" className={className} onClick={() => setOpen(true)}>
        {t('cta')}
      </Button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        eyebrow={t('eyebrow')}
        title={t('title')}
        className="add-sheet"
      >
        {address && (
          <Choice
            icon="mail"
            title={t('forward')}
            sub={t('forwardSub')}
            right={<CopyButton value={address} label={tc('copy')} />}
          >
            <span className="mono choice-addr">{address}</span>
          </Choice>
        )}
        <Choice icon="upload" title={t('upload')} sub={t('uploadSub')} href="/bills/upload" />
        <Choice icon="pencil" title={t('hand')} sub={t('handSub')} href="/bills/new" />
      </Sheet>
    </>
  );
}
