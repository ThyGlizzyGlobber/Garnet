import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui';
import { pageContext } from '@/lib/context';
import { isLlmConfigured } from '@/lib/env';
import { UploadForm } from './upload-form';

export default async function UploadPage() {
  await pageContext();
  const t = await getTranslations('upload');
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        title={t('title')}
        subtitle={isLlmConfigured() ? t('subtitleLlm') : t('subtitleNoLlm')}
      />
      <UploadForm />
    </div>
  );
}
