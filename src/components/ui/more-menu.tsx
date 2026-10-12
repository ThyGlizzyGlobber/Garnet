'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '@/components/app/icons';
import { cx } from './cx';

export interface MoreMenuItem {
  label: string;
  icon?: string;
  /** Posts this action with the hidden fields (a form). */
  action: (fd: FormData) => Promise<void>;
  hidden?: Record<string, string>;
  /** Asked before posting (a destructive choice). */
  confirm?: string;
  tone?: 'bad';
}

/**
 * A three-dots button holding choices that should be deliberate
 * (SCOPE-redesign-2.md §4 Households: Leave and Make primary). Opens on a
 * click; Escape or a click elsewhere closes it. 44 px round target.
 */
export function MoreMenu({
  label,
  items,
  error,
}: {
  label: string;
  items: MoreMenuItem[];
  /** A line to show under the choices (why something can't be done yet). */
  error?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  if (!items.length) return null;
  return (
    <div ref={box} className="mm">
      <button
        type="button"
        className="ibtn mm-btn"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="more" width={20} height={20} />
      </button>
      {open && (
        <div className="mm-menu" role="menu" aria-label={label}>
          {items.map((it) => (
            <form
              key={it.label}
              action={it.action}
              onSubmit={(e) => {
                if (it.confirm && !window.confirm(it.confirm)) e.preventDefault();
              }}
            >
              {Object.entries(it.hidden ?? {}).map(([k, v]) => (
                <input key={k} type="hidden" name={k} value={v} />
              ))}
              <button type="submit" role="menuitem" className={cx('mm-item', it.tone)}>
                {it.icon && <Icon name={it.icon} width={17} height={17} />}
                <span>{it.label}</span>
              </button>
            </form>
          ))}
          {error && <div className="mm-err">{error}</div>}
        </div>
      )}
    </div>
  );
}
