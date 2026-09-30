import { getTranslations } from 'next-intl/server';
import { NotFoundCard } from '@/components/app/states';

export default async function AppNotFound() {
  const t = await getTranslations('states.notFound');
  return <NotFoundCard title={t('title')} body={t('body')} home={t('home')} />;
}
