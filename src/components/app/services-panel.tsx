'use client';

import Link from 'next/link';
import { useContext, useState } from 'react';
import { cx } from '@/components/ui/cx';
import { Icon } from './icons';
import { PanelClose } from './nav-items';
import { StackRing } from './stack-ring';

/** One service in the bar's Services panel, worded by the shell. */
export interface PanelRow {
  key: string;
  href: string;
  name: string;
  /** Its colour, as CSS. */
  colour: string;
  /** This month's figure, or a dash. */
  figure: string;
  /** Where it stands: the ring's fill and what sits in it, and the line under the name. */
  ring: {
    pct: number;
    centre: string;
    tick: boolean;
    tone: 'ok' | 'bad' | 'warn' | 'neutral' | 'none';
  };
  status: string;
  /** A main service's parts (Vehicles → its vehicles, Subscriptions → each one). */
  children?: { id: string; href: string; name: string; figure: string }[];
  /** "Open Vehicles", at the foot of its grown list. */
  openLabel?: string;
}

export interface PanelSection {
  name: string;
  total: string;
  rows: PanelRow[];
}

export interface PanelLabels {
  title: string;
  /** "All services · $3,184 this month · 2 to pay this week" */
  all: string;
  add: string;
  /** The arrow on a main service. */
  parts: string;
  /** With no services at all. */
  none: string;
}

/**
 * The bar's Services panel (SCOPE-header.md §3c, §3d): every service led by
 * its small ring and where it stands, three across, in the household's
 * groups with their totals, then My Services. A main service's row carries
 * an arrow and grows downward into its parts on hover, or on the arrow's
 * press (an iPad, a keyboard), the row and the list one piece; the row's
 * name opens its page. The foot opens the Services page and Add service.
 */
export function ServicesPanel({
  sections,
  mine,
  labels,
}: {
  sections: PanelSection[];
  mine: PanelSection[];
  labels: PanelLabels;
}) {
  const onClose = useContext(PanelClose);
  const [grown, setGrown] = useState<string | null>(null);
  const row = (r: PanelRow) => {
    const open = grown === r.key;
    const parts = r.children && r.children.length > 0;
    return (
      <div
        key={r.key}
        className={cx('sp-r', open && 'open', r.ring.tone === 'none' && 'quiet')}
        style={{ ['--svc' as string]: r.colour }}
        onMouseEnter={() => parts && setGrown(r.key)}
        onMouseLeave={() => parts && setGrown((g) => (g === r.key ? null : g))}
      >
        <Link href={r.href} className="sp-l" onClick={onClose}>
          <StackRing
            pct={r.ring.pct}
            label={r.status}
            className={cx('st-ring sp-ring', `is-${r.ring.tone}`)}
          >
            {r.ring.tick ? <Icon name="check" width={13} height={13} /> : r.ring.centre}
          </StackRing>
          <span className="sp-n">
            <b>{r.name}</b>
            <span>{r.status}</span>
          </span>
          <b className="sp-f">{r.figure}</b>
        </Link>
        {parts && (
          <button
            type="button"
            className="sp-arrow"
            aria-expanded={open}
            aria-label={`${labels.parts} · ${r.name}`}
            onClick={(e) => {
              // A mouse opens it by hovering; the press is for touch and keyboards.
              if ((e.nativeEvent as PointerEvent).pointerType === 'mouse') return;
              setGrown(open ? null : r.key);
            }}
          >
            <Icon name="chevron-down" width={14} height={14} />
          </button>
        )}
        {parts && open && (
          <div className="sp-kids">
            {r.children!.map((c) => (
              <Link key={c.id} href={c.href} className="sp-k" onClick={onClose}>
                <i aria-hidden="true" />
                <span>{c.name}</span>
                <b>{c.figure}</b>
              </Link>
            ))}
            <Link href={r.href} className="sp-k sp-open" onClick={onClose}>
              <span>{r.openLabel}</span>
              <Icon name="chevron-right" width={13} height={13} />
            </Link>
          </div>
        )}
      </div>
    );
  };
  const section = (s: PanelSection, i: number) => (
    <div key={`${s.name}-${i}`} className="sp-s">
      <div className="sp-h">
        <span>{s.name}</span>
        <span>{s.total}</span>
      </div>
      <div className="sp-g">{s.rows.map(row)}</div>
    </div>
  );
  return (
    <div className="sp" role="dialog" aria-label={labels.title}>
      {[...sections, ...mine].every((s) => !s.rows.length) && (
        <p className="sp-empty">{labels.none}</p>
      )}
      {sections.filter((s) => s.rows.length).map(section)}
      {mine.filter((s) => s.rows.length).map(section)}
      <div className="sp-ft">
        <Link href="/services" className="sp-all" onClick={onClose}>
          <Icon name="services" width={15} height={15} />
          <span>{labels.all}</span>
        </Link>
        <Link href="/services/new" className="btn btn-glass btn-sm" onClick={onClose}>
          <Icon name="plus" width={15} height={15} />
          <span>{labels.add}</span>
        </Link>
      </div>
    </div>
  );
}
