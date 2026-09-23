'use client';

import { useTranslations } from 'next-intl';
import { Card, Field, Input } from '@/components/ui';
import { ActionForm } from '@/components/ui/form';
import { uploadBillAction } from '@/app/(app)/review/actions';

export function UploadForm() {
  const t = useTranslations('upload');
  return (
    <ActionForm action={uploadBillAction} submitLabel={t('submit')}>
      {() => (
        <Card className="flex flex-col gap-4">
          <Field label={t('file')} hint={t('fileHint')}>
            <Input
              name="file"
              type="file"
              accept=".pdf,.html,.htm,.txt,.eml,application/pdf,text/html,text/plain"
              required
              className="file:mr-3 file:rounded-full file:border-0 file:bg-accent file:px-3 file:py-1 file:text-sm file:font-semibold file:text-accent-fg"
            />
          </Field>
        </Card>
      )}
    </ActionForm>
  );
}
