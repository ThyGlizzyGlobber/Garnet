import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Icon } from '@/components/app/icons';
import { getEnv } from '@/lib/env';
import { PRIVACY_NOTICE_VERSION } from '@/lib/regional';

export async function generateMetadata() {
  return { title: (await getTranslations('privacy'))('title') };
}

const SECTIONS = ['stored', 'who', 'area', 'services', 'where', 'choices', 'contact'] as const;

/**
 * Plain-language privacy notice, public so it can be read before signing up.
 * Its version is recorded with every sharing choice (PRIVACY_NOTICE_VERSION).
 */
export default async function PrivacyPage() {
  const t = await getTranslations('privacy');
  const ta = await getTranslations('app');
  const k = getEnv().REGIONAL_MIN_HOUSEHOLDS;
  return (
    <main className="outside">
      <div className="public">
        <Link href="/" className="auth-brand">
          <span className="mark">
            <Icon name="home" width={18} height={18} />
          </span>
          <b>{ta('name')}</b>
        </Link>
        <header className="d3-title">
          <div className="eyebrow">{t('eyebrow', { version: PRIVACY_NOTICE_VERSION })}</div>
          <h1>{t('title')}</h1>
          <p className="lede">{t('intro')}</p>
        </header>
        <div className="prose glass rounded-card">
          <p>{t('version', { version: PRIVACY_NOTICE_VERSION })}</p>
          {SECTIONS.map((s) => (
            <section key={s}>
              <h2>{t(`${s}.title`)}</h2>
              {(t.raw(`${s}.points`) as string[]).map((p, i) => (
                <p key={i}>{p.replace('{k}', String(k))}</p>
              ))}
            </section>
          ))}
          <p>
            <Link href="/">{t('back')}</Link>
          </p>
        </div>
      </div>
    </main>
  );
}
