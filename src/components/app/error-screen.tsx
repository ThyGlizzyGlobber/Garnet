'use client';

import { useTranslations } from 'next-intl';
import { Button, LinkButton } from '@/components/ui';
import { ErrorCard } from './states';

/** The error boundary's screen: what happened, a reference to quote, Try again and Home. */
export function ErrorScreen({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('states.error');
  return (
    <ErrorCard
      title={t('title')}
      body={t('body')}
      reference={
        error.digest ? t('ref', { ref: error.digest.slice(0, 8).toUpperCase() }) : undefined
      }
    >
      <Button icon="rotate" onClick={reset}>
        {t('tryAgain')}
      </Button>
      <LinkButton href="/" variant="secondary" icon="home">
        {t('home')}
      </LinkButton>
    </ErrorCard>
  );
}
