'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Icon } from './icons';

/**
 * "Households" in the account area's menu (owner, 2026-10-02): the line
 * opens the Households page, and its arrow shows every household the person
 * belongs to, the primary one labelled; choosing one opens it.
 */
export function NavHouseholds({
  label,
  households,
  labels,
  action,
}: {
  label: string;
  households: { memberId: string; name: string; icon: string; primary: boolean }[];
  labels: { primary: string; show: string; hide: string; open: string };
  /** Opens the household whose member id is posted. */
  action: (fd: FormData) => Promise<void>;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(true);
  return (
    <div className="nc-hh" data-open={open ? '' : undefined}>
      <div className="nc-hh-h">
        <Link
          href="/account"
          className="nav-i"
          aria-current={pathname === '/account' ? 'page' : undefined}
          aria-label={label}
        >
          <Icon name="home" width={21} height={21} />
          <span>{label}</span>
        </Link>
        {households.length > 0 && (
          <button
            type="button"
            className="nc-g-t nc-hh-t"
            aria-expanded={open}
            aria-label={`${open ? labels.hide : labels.show} · ${label}`}
            onClick={() => setOpen(!open)}
          >
            <Icon name="chevron-down" width={15} height={15} />
          </button>
        )}
      </div>
      {open && households.length > 0 && (
        <div className="nc-g-c nc-hh-c">
          {households.map((h) => (
            <form key={h.memberId} action={action}>
              <input type="hidden" name="memberId" value={h.memberId} />
              <button type="submit" className="nc-hh-i" aria-label={`${labels.open} · ${h.name}`}>
                <Icon name={h.icon} width={15} height={15} />
                <span>{h.name}</span>
                {h.primary && <em className="nc-hh-p">{labels.primary}</em>}
              </button>
            </form>
          ))}
        </div>
      )}
    </div>
  );
}
