import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

export default async function HomePage() {
  const t = await getTranslations();
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 px-4 py-12">
      <header>
        <p className="text-sm font-medium text-fg-muted">{t('app.name')}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">{t('home.title')}</h1>
      </header>
      <section className="rounded-card bg-surface p-6 shadow-card">
        <p className="text-base leading-relaxed text-fg-muted">{t('home.body')}</p>
        <Link
          href="/api/health"
          className="mt-5 inline-flex items-center rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-fg"
        >
          {t('home.healthLink')}
        </Link>
      </section>
      <p className="text-center text-xs text-fg-muted">{t('app.tagline')}</p>
    </main>
  );
}
