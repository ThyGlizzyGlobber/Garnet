import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Figtree, JetBrains_Mono } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import { RegisterServiceWorker } from '@/components/app/pwa';
import { Scene } from '@/components/app/scene';
import { ChartHover } from '@/components/charts/hover';
import { ToastProvider } from '@/components/ui/toast';
import { SCHEME, themeColor } from '@/lib/appearance';
import { getAppearance } from '@/lib/auth/appearance';
import './globals.css';

// Display: Bricolage Grotesque with its optical-size axis (tighter at big sizes). Body: Figtree.
const display = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-bricolage',
  display: 'swap',
  axes: ['opsz'],
});
const body = Figtree({ subsets: ['latin'], variable: '--font-figtree', display: 'swap' });
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
    // The tab's icon is the stone alone, no background (owner, 2026-10-03); the
    // home-screen icon keeps its dark tile, as iOS would fill transparency black.
    icons: {
      icon: [
        { url: '/favicon.svg', type: 'image/svg+xml' },
        { url: '/favicon.png', type: 'image/png', sizes: '64x64' },
      ],
      shortcut: '/favicon.ico',
      apple: '/icon-192.png',
    },
  };
}

/** The browser's own chrome follows the person's colours (theme-color). */
export async function generateViewport(): Promise<Viewport> {
  return {
    width: 'device-width',
    initialScale: 1,
    viewportFit: 'cover',
    themeColor: themeColor(await getAppearance()),
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  const { theme } = await getAppearance();
  return (
    <html
      lang={locale}
      className={`${display.variable} ${body.variable} ${mono.variable}`}
      data-palette={SCHEME}
      data-theme={theme === 'auto' ? undefined : theme}
    >
      <body>
        <Scene />
        <NextIntlClientProvider messages={messages}>
          <ToastProvider>{children}</ToastProvider>
        </NextIntlClientProvider>
        <ChartHover />
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
