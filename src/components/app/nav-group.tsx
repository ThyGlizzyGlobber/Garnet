'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useTransition, type DragEvent, type ReactNode } from 'react';
import { saveNavChildrenAction } from '@/app/(app)/nav-actions';
import { Icon } from './icons';
import { dragScroll, lowerHalf } from './nav-drag';

/**
 * A main service in the nav with its sub-services under an arrow
 * (Subscriptions → Netflix, Spotify; Vehicles → its vehicles). The name
 * opens the main service's page; the arrow shows or hides the sub-services.
 * Open while one of them, or the main service, is the page being shown.
 * The sub-services are dragged into the person's order (a line shows where
 * one lands), saved at once; the main service's page shows them in it.
 */
export function NavGroup({
  href,
  groupKey,
  items,
  label,
  colour,
  showLabel,
  hideLabel,
  row,
}: {
  href: string;
  /** The main service's key in the person's arrangement ("c:vehicle", "mt:donations"). */
  groupKey: string;
  /** Its sub-services (or vehicles), each a line drawn by the shell. */
  items: { id: string; href: string; node: ReactNode }[];
  label: string;
  /** The main service's colour, as CSS. */
  colour: string;
  showLabel: string;
  hideLabel: string;
  /** The main service's own line: dot, name, figure. */
  row: ReactNode;
}) {
  const pathname = usePathname();
  // Open on the main service's page or a sub-service's (their links may carry ?open=).
  const here = pathname === href || items.some((c) => c.href.split(/[?#]/)[0] === pathname);
  const [open, setOpen] = useState<boolean | null>(null);
  const shown = open ?? here;

  // The order shown: a change not yet back from the server, else the server's.
  const [, start] = useTransition();
  const sent = items.map((c) => c.id).join(',');
  const [seen, setSeen] = useState(sent);
  const [order, setOrder] = useState<string[] | null>(null);
  if (seen !== sent) {
    setSeen(sent);
    setOrder(null);
  }
  const byId = new Map(items.map((c) => [c.id, c]));
  const ids = order ? order.filter((id) => byId.has(id)) : items.map((c) => c.id);
  const [drag, setDrag] = useState<string | null>(null);
  const [drop, setDrop] = useState<number | null>(null);

  const move = (id: string, index: number) => {
    const from = ids.indexOf(id);
    const at = from < index ? index - 1 : index;
    if (from < 0 || from === at) return;
    const rest = ids.filter((x) => x !== id);
    const next = [...rest.slice(0, at), id, ...rest.slice(at)];
    setOrder(next);
    start(() => saveNavChildrenAction(groupKey, next));
  };
  const end = () => {
    setDrag(null);
    setDrop(null);
  };

  return (
    <div className="nc-g" data-open={shown ? '' : undefined}>
      <div className="nc-g-h">
        <Link
          href={href}
          className="nc-s"
          draggable={false}
          style={{ ['--svc' as string]: colour }}
          aria-current={pathname === href ? 'page' : undefined}
        >
          {row}
        </Link>
        <button
          type="button"
          className="nc-g-t"
          aria-expanded={shown}
          aria-label={`${shown ? hideLabel : showLabel} · ${label}`}
          onClick={() => setOpen(!shown)}
        >
          <Icon name="chevron-down" width={15} height={15} />
        </button>
      </div>
      {shown && (
        <div
          className="nc-g-c"
          onDragOver={(e) => {
            if (!drag) return;
            e.preventDefault();
            e.stopPropagation();
            dragScroll(e);
          }}
          onDrop={(e: DragEvent) => {
            if (!drag) return;
            e.preventDefault();
            e.stopPropagation();
            if (drop !== null) move(drag, drop);
            end();
          }}
        >
          {ids.map((id, i) => (
            <div
              key={id}
              className="nc-dnd"
              draggable={ids.length > 1}
              data-drop={
                drop === i
                  ? 'before'
                  : drop === ids.length && i === ids.length - 1
                    ? 'after'
                    : undefined
              }
              data-dragging={drag === id ? '' : undefined}
              onDragStart={(e) => {
                // Only this sub-service moves, not the main service around it.
                e.stopPropagation();
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', id);
                setDrag(id);
              }}
              onDragEnd={end}
              onDragOver={(e) => {
                if (!drag) return;
                e.preventDefault();
                e.stopPropagation();
                const at = i + (lowerHalf(e) ? 1 : 0);
                if (drop !== at) setDrop(at);
              }}
            >
              {byId.get(id)!.node}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
