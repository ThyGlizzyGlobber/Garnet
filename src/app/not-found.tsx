import { getTranslations } from 'next-intl/server';
import { NotFoundCard } from '@/components/app/states';

/** A URL that matches nothing, outside the signed-in shell. */
export default async function NotFound() {
  const t = await getTranslations('states.notFound');
  return (
    <main className="outside">
      <div className="public">
        <NotFoundCard title={t('title')} body={t('body')} home={t('home')} />
      </div>
    </main>
  );
}
