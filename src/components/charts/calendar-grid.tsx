import Link from 'next/link';
import { colourCss } from '@/lib/palette';

export interface CalendarDay {
  /** YYYY-MM-DD */
  date: string;
  /** The day number, or the month's name on the 1st. */
  label: string;
  today?: boolean;
  past?: boolean;
  /** Every due date that day is paid. */
  done?: boolean;
  /** Service colours of what's due that day (up to three shown). */
  dots?: string[];
  href?: string;
  /** What's due, for the title and screen readers. */
  title?: string;
}

/** Weeks at a glance with every due date marked; a day with bills links to the first. */
export function CalendarGrid({ days, weekdays }: { days: CalendarDay[]; weekdays: string[] }) {
  return (
    <div className="cal-grid">
      {weekdays.map((w, i) => (
        <span key={i} className="cal-h" aria-hidden="true">
          {w}
        </span>
      ))}
      {days.map((d) => {
        const dots = d.dots ?? [];
        const cls = [
          'cal-d',
          d.today && 'today',
          d.past && 'past',
          dots.length > 0 && 'has',
          d.done && 'done',
        ]
          .filter(Boolean)
          .join(' ');
        const inner = (
          <>
            <span>{d.label}</span>
            {dots.length > 0 && (
              <span className="cal-dots">
                {dots.slice(0, 3).map((c, i) => (
                  <i key={i} style={{ ['--c' as string]: colourCss(c) }} />
                ))}
              </span>
            )}
          </>
        );
        return d.href ? (
          <Link key={d.date} href={d.href} className={cls} title={d.title} aria-label={d.title}>
            {inner}
          </Link>
        ) : (
          <span key={d.date} className={cls}>
            {inner}
          </span>
        );
      })}
    </div>
  );
}
