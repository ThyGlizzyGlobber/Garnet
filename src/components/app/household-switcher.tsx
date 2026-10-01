'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { cx } from '@/components/ui/cx';
import { Sheet } from '@/components/ui/sheet';
import { Icon } from './icons';

/** One household in the switcher: words and figures already formatted. */
export interface SwitcherRow {
  memberId: string;
  name: string;
  primary: boolean;
  current: boolean;
  /** The role's name: "Admin", "Tenant"… */
  role: string;
  /** The household type's icon. */
  icon: string;
  /** What you owe there ("$215"), or null when nothing. */
  figure: string | null;
  /** Something waiting or overdue there. */
  attention: boolean;
}

export interface SwitcherLabels {
  title: string;
  hint: string;
  primary: string;
  all: string;
  start: string;
  join: string;
  open: string;
}

/**
 * The household name top-left, as a button that opens the switcher
 * (SCOPE-accounts.md §3b): every household this person belongs to, the
 * primary first and the current one ticked; then All households, Start a
 * household and Join with a code. Picking one posts `action` with its member
 * id. The same piece draws the nav column's brand and the phone top bar's.
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
  const column = place === 'column';
  return (
    <>
      <button
        type="button"
        className={cx(column ? 'nc-brand' : 'brand', 'sw-btn')}
        aria-label={labels.open}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <span className="mark">
          <Icon name={icon} width={17} height={17} />
        </span>
        <span className={column ? 'nc-bt' : 'brand-t'}>
          <b>
            {title}
            <Icon name="chevron-down" width={14} height={14} className="sw-chev" />
          </b>
          <span>{sub}</span>
        </span>
      </button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        eyebrow={labels.hint}
        title={labels.title}
        className="sw-sheet"
      >
        <div className="sw-list">
          {rows.map((r) => (
            <form key={r.memberId} action={action}>
              <input type="hidden" name="memberId" value={r.memberId} />
              <button
                type="submit"
                className={cx('sw-row', r.current && 'on')}
                aria-current={r.current ? 'true' : undefined}
              >
                <span className="sw-ic">
                  <Icon name={r.icon} width={16} height={16} />
                </span>
                <span className="sw-t">
                  <b>
                    {r.name}
                    {r.primary && (
                      <i className="sw-prim" title={labels.primary}>
                        <Icon name="home" width={11} height={11} />
                      </i>
                    )}
                  </b>
                  <span className="muted small">{r.role}</span>
                </span>
                <span className="sw-fig">
                  {r.figure && <b>{r.figure}</b>}
                  {r.attention && <i className="sw-dot" aria-hidden="true" />}
                  {r.current && <Icon name="check" width={16} height={16} />}
                </span>
              </button>
            </form>
          ))}
        </div>
        <div className="sw-links">
          <Link href="/account" className="sw-link" onClick={() => setOpen(false)}>
            <Icon name="grid" width={17} height={17} />
            <span>{labels.all}</span>
          </Link>
          <Link href="/setup" className="sw-link" onClick={() => setOpen(false)}>
            <Icon name="plus" width={17} height={17} />
            <span>{labels.start}</span>
          </Link>
          <Link href="/account#join" className="sw-link" onClick={() => setOpen(false)}>
            <Icon name="link" width={17} height={17} />
            <span>{labels.join}</span>
          </Link>
        </div>
      </Sheet>
    </>
  );
}
