'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cx } from '@/components/ui/cx';
import { Icon } from './icons';
import { focusFirst, menuKeys } from './menu-keys';
import { StackRing } from './stack-ring';

/** One household in the switcher. */
export interface SwitcherRow {
  memberId: string;
  name: string;
  current: boolean;
  /** The household type's icon. */
  icon: string;
  /**
   * Its month, for the desktop menu's panel: the ring (bills paid of bills
   * due this month), "Maple Street · October", the month's total and what's
   * left to pay. Formatted by the shell.
   */
  card?: {
    pct: number;
    allPaid: boolean;
    percent: string;
    title: string;
    figure: { main: string; minor: string; tail: string };
    sub: string;
    ringLabel: string;
  };
}

export interface SwitcherLabels {
  /** "Your households", the list's name for screen readers. */
  title: string;
  open: string;
  /** The Account Dashboard. */
  dashboard: string;
}

/**
 * The household's button that drops down every household this person
 * belongs to, and under them the Dashboard (owner, 2026-10-02: simple, no
 * starting or joining from here). Picking a household posts `action` with
 * its member id. In the desktop menu (`card`) the household's card itself is
 * the button, and when it opens the card and the list become one dark panel
 * (SCOPE-shell.md §3h): each other household as a card with its month ring,
 * total and what's left to pay, then Dashboard. Elsewhere (the iPad rail,
 * the phone's top bar) it is a plain list.
 */
export function HouseholdSwitcher({
  place,
  icon = 'home',
  title,
  sub,
  rows,
  labels,
  action,
  card,
}: {
  place: 'column' | 'topbar';
  icon?: string;
  title: string;
  sub: ReactNode;
  rows: SwitcherRow[];
  labels: SwitcherLabels;
  action: (fd: FormData) => Promise<void>;
  /** The household as a card (the desktop menu): its month ring and figures. */
  card?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const column = place === 'column';
  // The desktop menu's card drops a panel of household cards; in the header (and
  // on a phone) the list is plain, an extension of the button (owner, 2026-10-05).
  const panel = column && !!card && rows.some((r) => r.card);
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
    <div
      ref={box}
      className={cx('sw', column ? 'sw-column' : 'sw-topbar')}
      onKeyDown={(e) => open && menuKeys(e)}
    >
      <button
        type="button"
        className={cx(column ? 'nc-brand' : 'brand', 'sw-btn', card ? 'has-card' : undefined)}
        aria-label={labels.open}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key !== 'ArrowDown') return;
          e.preventDefault();
          setOpen(true);
          setTimeout(() => focusFirst(box.current?.querySelector('.sw-menu')), 0);
        }}
      >
        <span className="mark">
          <Icon name={icon} width={17} height={17} />
        </span>
        <span className={column ? 'nc-bt' : 'brand-t'}>
          <b>
            {column ? (
              title
            ) : (
              // As wide as the longest household's name (the others laid over it,
              // unseen), so the button keeps one width as you switch (owner, 2026-10-05).
              <span className="sw-fit">
                <span className="sw-name">{title}</span>
                {rows.map((r) => (
                  <span key={r.memberId} className="sw-ghost" aria-hidden="true">
                    {r.name}
                  </span>
                ))}
              </span>
            )}
            {!column && <Icon name="chevron-down" width={14} height={14} className="sw-chev" />}
          </b>
          <span>{sub}</span>
        </span>
        {card && <span className="sw-card">{card}</span>}
        {/* In the column, and as a card, the arrow sits at the far edge. */}
        {(column || card) && (
          <Icon name="chevron-down" width={16} height={16} className="sw-chev" />
        )}
      </button>
      {open && panel && (
        <div className="sw-menu sw-panel" role="menu" aria-label={labels.title}>
          {rows
            .filter((r) => !r.current && r.card)
            .map((r) => (
              <form key={r.memberId} action={action}>
                <input type="hidden" name="memberId" value={r.memberId} />
                <button type="submit" role="menuitem" className="sw-hcard">
                  <StackRing pct={r.card!.pct} label={r.card!.ringLabel} className="st-ring sm">
                    {r.card!.allPaid ? (
                      <Icon name="check" width={14} height={14} />
                    ) : (
                      r.card!.percent
                    )}
                  </StackRing>
                  <span className="st-hh-t">
                    <span>{r.card!.title}</span>
                    <b>
                      {r.card!.figure.main}
                      <small>{r.card!.figure.minor}</small>
                      {r.card!.figure.tail}
                    </b>
                    <span>{r.card!.sub}</span>
                  </span>
                  <Icon name="chevron-right" width={15} height={15} className="sw-go" />
                </button>
              </form>
            ))}
          <Link
            href="/account"
            role="menuitem"
            className="sw-hcard sw-dash"
            onClick={() => setOpen(false)}
          >
            <span className="sw-dash-i">
              <Icon name="dashboard" width={20} height={20} />
            </span>
            <b>{labels.dashboard}</b>
            <Icon name="chevron-right" width={15} height={15} className="sw-go" />
          </Link>
        </div>
      )}
      {open && !panel && (
        <div className="sw-menu" role="menu" aria-label={labels.title}>
          {/* In the header the button is the current household: the list is the others. */}
          {rows
            .filter((r) => column || !r.current)
            .map((r) => (
              <form key={r.memberId} action={action}>
                <input type="hidden" name="memberId" value={r.memberId} />
                <button
                  type="submit"
                  role="menuitem"
                  className={cx('sw-item', r.current && 'on')}
                  aria-current={r.current ? 'true' : undefined}
                >
                  <span className="sw-ic">
                    <Icon name={r.icon} width={17} height={17} />
                  </span>
                  <span>{r.name}</span>
                  {r.current && <Icon name="check" width={16} height={16} className="sw-tick" />}
                </button>
              </form>
            ))}
          <div className="sw-sep" role="separator" />
          <Link href="/account" role="menuitem" className="sw-item" onClick={() => setOpen(false)}>
            <span className="sw-ic">
              <Icon name="dashboard" width={17} height={17} />
            </span>
            <span>{labels.dashboard}</span>
          </Link>
        </div>
      )}
    </div>
  );
}
