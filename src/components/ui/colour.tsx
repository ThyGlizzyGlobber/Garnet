import type { CSSProperties } from 'react';
import { Icon } from '@/components/app/icons';
import { colourCss } from '@/lib/palette';

/**
 * Things drawn in a service's or member's own colour. Colours are stored as the
 * light-scheme hex; these follow the light/dark scheme (see colourCss).
 */

function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}

/**
 * A small colour key beside a name (lists, rankings, legends); `dot` for a
 * person. `className` replaces the default size and shape.
 */
export function Swatch({
  colour,
  dot = false,
  className,
}: {
  colour: string;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cx('shrink-0', className ?? (dot ? 'size-3 rounded-full' : 'size-2.5 rounded-sm'))}
      style={{ background: colourCss(colour) }}
    />
  );
}

/** A bar filled to `pct` (0–100) in a colour, e.g. a service's share of the year. */
export function ColourBar({ colour, pct }: { colour: string; pct: number }) {
  return (
    <div className="mt-1 h-2 rounded-full bg-surface-2">
      <div
        className="h-2 rounded-full"
        style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: colourCss(colour) }}
      />
    </div>
  );
}

/** A member's initial on their colour fading into the accent. */
export function Avatar({
  name,
  colour,
  className = 'size-10 text-sm',
}: {
  name: string;
  colour: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'grid shrink-0 place-items-center rounded-full font-bold text-on-colour shadow-inner',
        className,
      )}
      style={{ background: `linear-gradient(135deg, ${colourCss(colour)}, var(--color-accent))` }}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

/**
 * A service's icon in its colour: `filled` (a solid rounded square, for rows
 * in lists), `soft` (the icon in colour on a quiet disc, for tinted tiles) or
 * `glow` (a frosted disc with a halo, for headers and tiles).
 */
export function IconDisc({
  icon,
  colour,
  variant = 'filled',
  size = 36,
  iconSize: iconPx,
  className,
}: {
  icon: string;
  colour: string;
  variant?: 'filled' | 'soft' | 'glow';
  /** Width and height: px, or any CSS length (the wall sizes by viewport). */
  size?: number | string;
  /** Icon size in px; about half the disc by default. */
  iconSize?: number;
  className?: string;
}) {
  const c = colourCss(colour);
  const iconSize =
    iconPx ??
    (typeof size === 'number' ? Math.round(size * (variant === 'filled' ? 0.45 : 0.44)) : 24);
  const style: CSSProperties =
    variant === 'glow'
      ? { width: size, height: size, color: c, ['--glow' as string]: c }
      : variant === 'soft'
        ? { width: size, height: size, color: c }
        : { width: size, height: size, background: c };
  return (
    <span
      aria-hidden="true"
      className={cx(
        'shrink-0',
        variant === 'glow'
          ? 'glow-disc'
          : variant === 'soft'
            ? 'grid place-items-center rounded-full bg-surface-2'
            : 'grid place-items-center rounded-xl text-on-colour',
        className,
      )}
      style={style}
    >
      <Icon name={icon} width={iconSize} height={iconSize} />
    </span>
  );
}
