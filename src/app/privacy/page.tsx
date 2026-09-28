import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { getEnv } from '@/lib/env';
import { PRIVACY_NOTICE_VERSION } from '@/lib/regional';

export const metadata = { title: 'How your data is used' };

const SECTIONS = ['stored', 'who', 'area', 'services', 'where', 'choices', 'contact'] as const;

/**
 * Plain-language privacy notice, public so it can be read before signing up.
 * Its version is recorded with every sharing choice (PRIVACY_NOTICE_VERSION).
 */
export default async function PrivacyPage() {
  const t = await getTranslations('privacy');
  const k = getEnv().REGIONAL_MIN_HOUSEHOLDS;
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 text-fg">
      <div className="window flex flex-col gap-6 p-6 sm:p-8">
        <header>
          <h1 className="font-display text-3xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="mt-1 text-sm text-fg-muted">
            {t('version', { version: PRIVACY_NOTICE_VERSION })}
          </p>
          <p className="mt-3 text-sm">{t('intro')}</p>
        </header>
        {SECTIONS.map((s) => (
          <section key={s} className="flex flex-col gap-2">
            <h2 className="font-display text-lg font-semibold">{t(`${s}.title`)}</h2>
            {(t.raw(`${s}.points`) as string[]).map((p, i) => (
              <p key={i} className="text-sm text-fg-muted">
                {p.replace('{k}', String(k))}
              </p>
            ))}
          </section>
        ))}
        <Link href="/" className="text-sm font-semibold text-accent">
          {t('back')}
        </Link>
      </div>
    </main>
  );
}
