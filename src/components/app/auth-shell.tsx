import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { GarnetMark } from './garnet-mark';
import { Icon } from './icons';
import { ForgetOfflinePages } from './pwa';

/**
 * The frame for everything outside the app (sign-in, codes, PINs, setting up,
 * joining): the product's name and a line or two on the left, a strong-glass
 * card on the right, and a footer with Privacy and the demo. On a phone the
 * side shrinks to the name. `wide` gives the card room for a wizard.
 */
export async function AuthShell({
  side,
  wide = false,
  foot = true,
  demoLink = true,
  children,
}: {
  /** The left-hand copy; the product's pitch when left out. */
  side?: ReactNode;
  wide?: boolean;
  /** The Privacy · demo footer. */
  foot?: boolean;
  /** The demo link in the footer (off on the sign-in page, which has the demo box itself). */
  demoLink?: boolean;
  children: ReactNode;
}) {
  const t = await getTranslations('outside');
  const ta = await getTranslations('app');
  return (
    <main className="outside">
      <ForgetOfflinePages />
      <div className={wide ? 'auth wide' : 'auth'}>
        <div className="auth-side">
          <Link href="/" className="auth-brand">
            <GarnetMark />
            <b>{ta('name')}</b>
          </Link>
          {side ?? (
            <>
              <h1 className="auth-big">{t('pitch')}</h1>
              <ul className="auth-points">
                <li>
                  <Icon name="mail" width={16} height={16} /> {t('point1')}
                </li>
                <li>
                  <Icon name="split" width={16} height={16} /> {t('point2')}
                </li>
                <li>
                  <Icon name="calendar" width={16} height={16} /> {t('point3')}
                </li>
              </ul>
            </>
          )}
        </div>
        <div className="auth-main">
          <section className="glass-strong auth-card rounded-card">{children}</section>
          {foot && (
            <p className="auth-foot muted small">
              <Link href="/privacy">{t('privacy')}</Link>
              {demoLink && (
                <>
                  {' · '}
                  <Link href="/login#demo">{t('demo')}</Link>
                </>
              )}
            </p>
          )}
        </div>
      </div>
    </main>
  );
}

/** A big line and a sentence for the left side. */
export function AuthSide({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <>
      <h1 className="auth-big">{title}</h1>
      {children && <p className="muted">{children}</p>}
    </>
  );
}

/** A card's heading and its line. */
export function AuthHead({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <>
      <h2>{title}</h2>
      {children && <p className="muted">{children}</p>}
    </>
  );
}

export function Notice({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'danger';
  children: ReactNode;
}) {
  return (
    <p
      role={tone === 'danger' ? 'alert' : 'status'}
      className={`rounded-inner px-4 py-3 text-sm font-medium ${tone === 'danger' ? 'bg-danger-soft text-danger' : 'well text-fg-2'}`}
    >
      {children}
    </p>
  );
}
