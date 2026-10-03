import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { Icon } from '@/components/app/icons';
import { addDays } from '@/lib/dates';
import { unitInline } from './fmt';

/**
 * The pieces every Home widget is drawn from (SCOPE-widgets.md §3): one
 * instrument (a ring, a gauge, or an icon and a figure) leading three fixed
 * sizes. A widget hands over a WxSpec of formatted strings; WxCard lays it
 * out at Small, Medium or Large. The CSS is src/styles/widgets.css.
 */
export type WxSize = 's' | 'm' | 'l';
type WxTone = 'ok' | 'warn' | 'overdue';

type WxInstrument =
  | {
      kind: 'ring';
      /** 0 to 1. Nothing is drawn at 0: an empty ring. */
      value: number;
      /** A three-quarter arc, for a reading against a limit. */
      gauge?: boolean;
      big?: string;
      /** A measurement's unit, placed by the four-character rule. */
      unit?: string;
      small?: string;
      /** An icon in the centre instead of a figure (a tick, or the service's own). */
      icon?: string;
      /** The icon as a solid shape: no bills yet. */
      filled?: boolean;
    }
  | { kind: 'plain'; icon: string; big: string; small: string; compact?: boolean };

interface WxFact {
  label: string;
  value: string;
  tone?: WxTone;
}

interface WxAction {
  icon: string;
  label: string;
  onClick?: () => void;
  href?: string;
}

export interface WxSpec {
  /** A CSS colour for the instrument; the accent when the widget is about the whole household. */
  colour?: string;
  /** The ring and its words turn the overdue red. */
  overdue?: boolean;
  instrument: WxInstrument;
  /** Small: the figure and the name under the instrument. */
  cap: [string, string];
  title: string;
  figure?: ReactNode;
  facts?: WxFact[];
  /** Large: the chart or list under the top block. */
  body?: ReactNode;
  action?: WxAction;
  /** Where a tap on the widget goes (its buttons and list rows keep their own). */
  href?: string;
}

const R = 45.25;
const C = 2 * Math.PI * R;

function Ring({ i }: { i: Extract<WxInstrument, { kind: 'ring' }> }) {
  const span = i.gauge ? 0.75 : 1;
  const value = Math.max(0, Math.min(1, i.value));
  return (
    <div className="wx-ring">
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <g transform={`rotate(${i.gauge ? 135 : -90} 50 50)`}>
          <circle className="wx-track" cx="50" cy="50" r={R} strokeDasharray={`${C * span} ${C}`} />
          {value > 0 && (
            <circle
              className="wx-arc"
              cx="50"
              cy="50"
              r={R}
              strokeDasharray={`${C * span * value} ${C}`}
            />
          )}
        </g>
      </svg>
      <div className="wx-ring-in">
        {i.icon ? (
          <span className={i.filled ? 'wx-ic filled' : 'wx-ic'}>
            <Icon name={i.icon} />
          </span>
        ) : (
          <>
            <b>
              {i.big}
              {i.unit && (
                <u className={unitInline(i.big ?? '', i.unit) ? 'in' : undefined}>{i.unit}</u>
              )}
            </b>
            {i.small && <span>{i.small}</span>}
          </>
        )}
      </div>
    </div>
  );
}

function Plain({ i }: { i: Extract<WxInstrument, { kind: 'plain' }> }) {
  return (
    <div className={i.compact ? 'wx-plain compact' : 'wx-plain'}>
      <Icon name={i.icon} />
      <b>{i.big}</b>
      <span>{i.small}</span>
    </div>
  );
}

const Instrument = ({ i }: { i: WxInstrument }) =>
  i.kind === 'ring' ? <Ring i={i} /> : <Plain i={i} />;

/** A figure with its cents set small: "$3,184" and ".20". */
export function WxFig({ main, minor }: { main: string; minor?: string }) {
  return (
    <div className="wx-fig">
      {main}
      {minor && <small>{minor}</small>}
    </div>
  );
}

/** One line of a Large widget's list: a coloured dot, a title over a quiet line, a value. */
export function WxRow({
  colour,
  title,
  sub,
  value,
  note,
  href,
}: {
  colour?: string;
  title: string;
  sub?: string;
  value?: string;
  note?: string;
  href?: string;
}) {
  const inner = (
    <>
      {colour && <i className="wx-dot" style={{ background: colour }} />}
      <span className="wx-rm">
        <b>{title}</b>
        {sub && <span>{sub}</span>}
      </span>
      {(value || note) && (
        <span className="wx-re">
          {value && <b>{value}</b>}
          {note && <span>{note}</span>}
        </span>
      )}
    </>
  );
  return href ? (
    <Link href={href} className="wx-row">
      {inner}
    </Link>
  ) : (
    <div className="wx-row">{inner}</div>
  );
}

/** A label and its value on one line. */
export function WxKv({ label, value, tone }: WxFact) {
  return (
    <div className="wx-row wx-kv">
      <span className="wx-rm">{label}</span>
      <span className="wx-re">
        <b className={tone ? `wx-t-${tone}` : undefined}>{value}</b>
      </span>
    </div>
  );
}

/** A few bars, the last one in the widget's colour: the months up to now. */
export function WxBars({
  values,
  labels,
  flat,
}: {
  values: number[];
  labels: string[];
  /** Every bar the same grey: months that haven't happened. */
  flat?: boolean;
}) {
  const max = Math.max(...values, 0);
  return (
    <div className={flat ? 'wx-bars flat' : 'wx-bars'}>
      {values.map((v, i) => (
        <div key={i} className={i === values.length - 1 ? 'on' : undefined}>
          <i style={{ height: `${max > 0 ? Math.max(4, (v / max) * 100) : 4}%` }} />
          <span>{labels[i]}</span>
        </div>
      ))}
    </div>
  );
}

/** A sentence or two where a figure would be: an empty widget saying what will appear. */
export function WxNote({ children }: { children: ReactNode }) {
  return <p className="wx-note">{children}</p>;
}

/**
 * Weeks of days from a Monday, a dot under each day something is due (in its
 * service's colour, hollow once paid) and today filled in.
 */
export function WxCal({
  start,
  weeks,
  today,
  locale,
  items,
}: {
  start: string;
  weeks: number;
  today: string;
  locale: string;
  items: { date: string; colour: string; paid: boolean }[];
}) {
  const letter = new Intl.DateTimeFormat(locale, { weekday: 'narrow', timeZone: 'UTC' });
  const days = Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i));
  return (
    <div className="wx-cal">
      {days.slice(0, 7).map((d) => (
        <span key={`h${d}`} className="hd">
          {letter.format(new Date(`${d}T00:00:00Z`))}
        </span>
      ))}
      {days.map((d) => {
        const due = items.find((x) => x.date === d);
        return (
          <span key={d} className={d === today ? 'today' : d < today ? 'past' : undefined}>
            {Number(d.slice(8, 10))}
            {due && (
              <i className={due.paid ? 'paid' : undefined} style={{ background: due.colour }} />
            )}
          </span>
        );
      })}
    </div>
  );
}

/** Quick actions: a grid of buttons, each an icon over its name. */
export function WxActs({ acts }: { acts: { icon: string; label: string; href: string }[] }) {
  return (
    <div className={`wx-acts n${acts.length}`}>
      {acts.map((a) => (
        <Link key={a.href + a.label} href={a.href} className="wx-act">
          <Icon name={a.icon} />
          <span>{a.label}</span>
        </Link>
      ))}
    </div>
  );
}

/** Small's one action: a round button over its name. */
export function WxBig({
  icon,
  label,
  sub,
  href,
}: {
  icon: string;
  label: string;
  sub: string;
  href: string;
}) {
  return (
    <div className="wx wx-s">
      <Link href={href} className="wx-big" aria-label={label}>
        <Icon name={icon} />
      </Link>
      <div className="wx-cap">
        <b>{label}</b>
        <span>{sub}</span>
      </div>
    </div>
  );
}

export function WxRows({ children }: { children: ReactNode }) {
  return <div className="wx-rows">{children}</div>;
}

function Action({ a, round }: { a: WxAction; round?: boolean }) {
  const cls = round ? 'wx-round' : 'wx-foot';
  const inner = (
    <>
      <Icon name={a.icon} />
      {!round && a.label}
    </>
  );
  return a.href ? (
    <Link href={a.href} className={cls} aria-label={round ? a.label : undefined}>
      {inner}
    </Link>
  ) : (
    <button
      type="button"
      className={cls}
      onClick={a.onClick}
      aria-label={round ? a.label : undefined}
    >
      {inner}
    </button>
  );
}

/** A widget at one of the three sizes. */
export function WxCard({ spec, size }: { spec: WxSpec; size: WxSize }) {
  const style = {
    '--wx-c': spec.overdue ? 'var(--overdue)' : (spec.colour ?? 'var(--p-accent)'),
  } as CSSProperties;
  const cls = `wx wx-${size}${spec.instrument.kind === 'plain' ? ' wx-pl' : ''}`;
  const link = spec.href && <Link href={spec.href} className="wx-link" aria-label={spec.title} />;
  if (size === 's')
    return (
      <div className={cls} style={style}>
        {link}
        <Instrument i={spec.instrument} />
        <div className="wx-cap">
          <b>{spec.cap[0]}</b>
          <span>{spec.cap[1]}</span>
        </div>
      </div>
    );
  return (
    <div className={cls} style={style}>
      {link}
      <div className="wx-top">
        <Instrument i={spec.instrument} />
        <div className="wx-col">
          <div className="wx-title">{spec.title}</div>
          {spec.figure}
          {spec.facts?.map((f) => (
            <WxKv key={f.label} {...f} />
          ))}
        </div>
      </div>
      {size === 'm' && spec.action && <Action a={spec.action} round />}
      {size === 'l' && (
        <div className="wx-body">
          {spec.body}
          {spec.action && <Action a={spec.action} />}
        </div>
      )}
    </div>
  );
}

/** A widget before its numbers arrive: an empty ring and grey bars. */
export function WxSkeleton({ size }: { size: WxSize }) {
  const ring = <Ring i={{ kind: 'ring', value: 0, big: '' }} />;
  const bar = (w: number) => <i className="wx-sk" style={{ width: `${w}%` }} />;
  if (size === 's')
    return (
      <div className="wx wx-s" aria-busy="true">
        {ring}
        <div className="wx-cap">
          {bar(60)}
          {bar(40)}
        </div>
      </div>
    );
  return (
    <div className={`wx wx-${size}`} aria-busy="true">
      <div className="wx-top">
        {ring}
        <div className="wx-col">
          {bar(40)}
          {bar(75)}
          {bar(100)}
          {bar(100)}
        </div>
      </div>
      {size === 'l' && (
        <div className="wx-body">
          {bar(100)}
          {bar(100)}
          {bar(80)}
          {bar(90)}
        </div>
      )}
    </div>
  );
}
