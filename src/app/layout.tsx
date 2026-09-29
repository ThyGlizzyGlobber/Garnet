import type { Metadata, Viewport } from 'next';
import { JetBrains_Mono, Manrope, Outfit } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import { RegisterServiceWorker } from '@/components/app/pwa';
import { Scene } from '@/components/app/scene';
import { getTheme } from '@/lib/theme';
import './globals.css';

const manrope = Manrope({ subsets: ['latin'], variable: '--font-manrope', display: 'swap' });
const outfit = Outfit({ subsets: ['latin'], variable: '--font-outfit', display: 'swap' });
const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
  weight: ['400', '500'],
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('app');
  return {
    title: t('name'),
    description: t('description'),
    robots: { index: false, follow: false },
    manifest: '/manifest.webmanifest',
    appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: t('shortName') },
    icons: { icon: '/icon.svg', apple: '/icon-192.png' },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  // The browser's own chrome: keep in step with --color-bg in globals.css.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#e9e4dc' },
    { media: '(prefers-color-scheme: dark)', color: '#12151b' },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  const theme = await getTheme();
  return (
    <html
      lang={locale}
      className={`${manrope.variable} ${outfit.variable} ${mono.variable}`}
      data-theme={theme === 'auto' ? undefined : theme}
    >
      <body>
        <Scene />
        <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
