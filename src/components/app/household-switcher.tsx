'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cx } from '@/components/ui/cx';
import { Icon } from './icons';

/** One household in the switcher. */
export interface SwitcherRow {
  memberId: string;
  name: string;
  current: boolean;
  /** The household type's icon. */
  icon: string;
}

export interface SwitcherLabels {
  /** "Your households", the list's name for screen readers. */
  title: string;
  open: string;
  /** The Account Dashboard. */
  dashboard: string;
}

/**
 * The household name top-left, as a button that drops down a plain list of
 * every household this person belongs to (the current one ticked), and under
 * them the Dashboard (owner, 2026-10-02: simple, no starting or joining from
 * here; those live on the Dashboard). Picking a household posts `action` with
 * its member id. The same piece draws the nav column's brand and the phone
 * top bar's.
 */
export function HouseholdSwitcher({
  place,
  icon = 'home',
  title,
  sub,
  rows,
  labels,
  action,
}: {
  place: 'column' | 'topbar';
  icon?: string;
  title: string;
  sub: ReactNode;
  rows: SwitcherRow[];
  labels: SwitcherLabels;
  action: (fd: FormData) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const column = place === 'column';
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
  return (
    <div ref={box} className={cx('sw', column ? 'sw-column' : 'sw-topbar')}>
      <button
        type="button"
        className={cx(column ? 'nc-brand' : 'brand', 'sw-btn')}
        aria-label={labels.open}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="mark">
          <Icon name={icon} width={17} height={17} />
        </span>
        <span className={column ? 'nc-bt' : 'brand-t'}>
          <b>
            {title}
            {!column && <Icon name="chevron-down" width={14} height={14} className="sw-chev" />}
          </b>
          <span>{sub}</span>
        </span>
        {/* In the column the arrow sits at the far edge, the name taking the width. */}
        {column && <Icon name="chevron-down" width={16} height={16} className="sw-chev" />}
      </button>
      {open && (
        <div className="sw-menu" role="menu" aria-label={labels.title}>
          {rows.map((r) => (
            <form key={r.memberId} action={action}>
              <input type="hidden" name="memberId" value={r.memberId} />
              <button
                type="submit"
                role="menuitem"
                className={cx('sw-item', r.current && 'on')}
                aria-current={r.current ? 'true' : undefined}
              >
                <Icon name={r.icon} width={17} height={17} />
                <span>{r.name}</span>
                {r.current && <Icon name="check" width={16} height={16} className="sw-tick" />}
              </button>
            </form>
          ))}
          <div className="sw-sep" role="separator" />
          <Link href="/account" role="menuitem" className="sw-item" onClick={() => setOpen(false)}>
            <Icon name="grid" width={17} height={17} />
            <span>{labels.dashboard}</span>
          </Link>
        </div>
      )}
    </div>
  );
}
