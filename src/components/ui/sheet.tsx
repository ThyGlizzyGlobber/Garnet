'use client';

import { useEffect, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { IconButton } from './controls';
import { cx } from './cx';

/**
 * A sheet: a strong-glass panel over a dimmed page for a short task (add a
 * bill, record a payment, a document that's still waiting). Closes on Escape
 * or a click outside. Lay the body out with SheetRow and SheetActions.
 */
export function Sheet({
  open,
  onClose,
  eyebrow,
  title,
  lead,
  className,
  children,
}: {
  open: boolean;
  onClose: () => void;
  eyebrow?: ReactNode;
  title: ReactNode;
  /** Something before the title: a service disc. */
  lead?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const t = useTranslations('common');
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-wrap" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cx('sheet glass-strong', className)} role="dialog" aria-modal="true">
        <div className="sheet-body">
          <div className={cx('sheet-head', !lead && 'no-lead')}>
            {lead}
            <div>
              {eyebrow && <div className="eyebrow">{eyebrow}</div>}
              <h3>{title}</h3>
            </div>
            <IconButton icon="x" label={t('close')} onClick={onClose} />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

export function SheetRow({ children }: { children: ReactNode }) {
  return <div className="sheet-row">{children}</div>;
}

export function SheetActions({ children }: { children: ReactNode }) {
  return <div className="sheet-actions">{children}</div>;
}
