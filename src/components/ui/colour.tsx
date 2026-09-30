import type { CSSProperties } from 'react';
import { Icon } from '@/components/app/icons';
import { colourCss } from '@/lib/palette';
import { cx } from './cx';

/**
 * Things drawn in a service's or member's own colour. Colours are stored as
 * the light hex; `colourCss` turns a palette colour into its token, which
 * carries both the light and the dark step.
 */

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

export type IdentitySize = 'sm' | 'md' | 'lg';

/** A member's initial on their colour, fading towards the accent. */
export function Avatar({
  name,
  colour,
  size = 'md',
  className,
}: {
  name: string;
  colour: string;
  size?: IdentitySize;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      title={name}
      className={cx('av', size !== 'md' && `av-${size}`, className)}
      style={{ ['--m' as string]: colourCss(colour) }}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** Several members' avatars, overlapping. */
export function Avatars({
  members,
  size = 'sm',
  className,
}: {
  members: { name: string; colour: string }[];
  size?: IdentitySize;
  className?: string;
}) {
  return (
    <span className={cx('avs', className)}>
      {members.map((m) => (
        <Avatar key={m.name} name={m.name} colour={m.colour} size={size} />
      ))}
    </span>
  );
}

const discIcon: Record<IdentitySize, number> = { sm: 17, md: 21, lg: 28 };

/**
 * A service's icon on a disc in its colour: the colour mixed into pale glass
 * with a thin tinted rim (BRAND.md §7). `size` is sm 30, md 38 or lg 54 px,
 * or any width in px or CSS units for the wall.
 */
export function Disc({
  icon,
  colour,
  size = 'md',
  iconSize,
  className,
}: {
  icon: string;
  colour: string;
  size?: IdentitySize | number | string;
  /** Icon size in px; about half the disc by default. */
  iconSize?: number;
  className?: string;
}) {
  const named = typeof size === 'string' && size in discIcon ? (size as IdentitySize) : null;
  const style: CSSProperties = { ['--svc' as string]: colourCss(colour) };
  if (!named) {
    style.width = size;
    style.height = size;
  }
  const px =
    iconSize ?? (named ? discIcon[named] : typeof size === 'number' ? Math.round(size * 0.52) : 24);
  return (
    <span
      aria-hidden="true"
      className={cx('disc', named && named !== 'md' && `disc-${named}`, className)}
      style={style}
    >
      <Icon name={icon} width={px} height={px} />
    </span>
  );
}
