'use client';

import { useTranslations } from 'next-intl';
import { LocationField } from '@/components/app/location-field';
import { ActionForm } from '@/components/ui/form';
import { saveLocationAction } from './actions';

export function LocationForm({
  withData,
  initial,
}: {
  withData: string[];
  initial: { country: string; postalCode: string; locality: string };
}) {
  const t = useTranslations('location');
  return (
    <ActionForm action={saveLocationAction} submitLabel={t('save')}>
      {(errors) => <LocationField withData={withData} initial={initial} errors={errors} />}
    </ActionForm>
  );
}
