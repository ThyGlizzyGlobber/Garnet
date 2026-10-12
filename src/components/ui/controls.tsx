import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Icon } from '@/components/app/icons';
import { TopBack } from '@/components/app/top-back';
import { cx } from './cx';

/**
 * Controls (BRAND.md §7): glass capsules that sit on glass. Buttons are in
 * index.tsx; here are the icon button, the segmented control, the switch,
 * the search field and the back link.
 */

/** A round icon-only button (or link with `href`); `badge` counts, `accent` fills it. */
export function IconButton({
  icon,
  label,
  badge,
  accent = false,
  href,
  size = 20,
  className,
  ...props
}: {
  icon: string;
  label: string;
  badge?: number;
  accent?: boolean;
  href?: string;
  size?: number;
  className?: string;
} & Omit<ComponentProps<'button'>, 'children'>) {
  const cls = cx('ibtn', accent && 'accent', className);
  const inner = (
    <>
      <Icon name={icon} width={size} height={size} />
      {badge ? <i className="badge">{badge}</i> : null}
    </>
  );
  if (href)
    return (
      <Link href={href} className={cls} aria-label={label} title={label}>
        {inner}
      </Link>
    );
  return (
    <button type="button" className={cls} aria-label={label} title={label} {...props}>
      {inner}
    </button>
  );
}

export interface SegmentItem {
  value: string;
  label?: string;
  icon?: string;
  /** As a link (a filter in the URL) rather than a submit button. */
  href?: string;
}

/**
 * A segmented control. Items with `href` are links (the chosen one carries
 * aria-current); otherwise they are submit buttons named `name`, so a plain
 * form round-trip changes the choice.
 */
export function Segmented({
  items,
  value,
  name,
  small = false,
  label,
  className,
  onChange,
}: {
  items: SegmentItem[];
  value: string;
  name?: string;
  small?: boolean;
  /** Accessible name of the group. */
  label?: string;
  className?: string;
  /** In a client component: change the value in place instead of submitting. */
  onChange?: (value: string) => void;
}) {
  return (
    <div className={cx('seg', small && 'seg-sm', className)} role="group" aria-label={label}>
      {items.map((it) => {
        const on = it.value === value;
        const inner = (
          <>
            {it.icon && <Icon name={it.icon} width={16} height={16} />}
            {it.label && <span>{it.label}</span>}
          </>
        );
        return it.href ? (
          <Link
            key={it.value}
            href={it.href}
            className="seg-b"
            aria-current={on ? 'page' : undefined}
            aria-label={it.label ? undefined : it.value}
          >
            {inner}
          </Link>
        ) : (
          <button
            key={it.value}
            type={onChange ? 'button' : 'submit'}
            className="seg-b"
            name={name}
            value={it.value}
            aria-pressed={on}
            aria-label={it.label ? undefined : it.value}
            onClick={onChange ? () => onChange(it.value) : undefined}
          >
            {inner}
          </button>
        );
      })}
    </div>
  );
}

/**
 * A switch backed by a checkbox, so it works in any form without script
 * (SCOPE-redesign-2.md §4: 88 × 44, the word On or Off in the track, a tick
 * on the knob when on). The label is for assistive tech; put the visible
 * words beside it. For a switch that saves at once, see switch.tsx.
 */
export function Toggle({
  name,
  label,
  defaultChecked,
  checked,
  onChange,
  value = 'on',
  disabled,
}: {
  name?: string;
  label: string;
  defaultChecked?: boolean;
  checked?: boolean;
  onChange?: ComponentProps<'input'>['onChange'];
  value?: string;
  disabled?: boolean;
}) {
  const t = useTranslations('common');
  return (
    <label className="toggle">
      <input
        type="checkbox"
        role="switch"
        name={name}
        value={value}
        aria-label={label}
        defaultChecked={defaultChecked}
        checked={checked}
        onChange={onChange}
        disabled={disabled}
      />
      <span className="sw-on" aria-hidden="true">
        {t('on')}
      </span>
      <span className="sw-off" aria-hidden="true">
        {t('off')}
      </span>
      <i aria-hidden="true" />
    </label>
  );
}

/** The search capsule (a GET form's field by default). */
export function SearchField({
  placeholder,
  label,
  name = 'q',
  defaultValue,
  small = false,
  className,
  id,
  autoFocus = false,
}: {
  placeholder: string;
  /** Accessible name; the placeholder when left out. */
  label?: string;
  name?: string;
  defaultValue?: string;
  small?: boolean;
  className?: string;
  id?: string;
  /** Focus it as the page opens (the top bar's search icon leads here). */
  autoFocus?: boolean;
}) {
  return (
    <label className={cx('search', small && 'search-sm', className)}>
      <Icon name="search" width={17} height={17} />
      <input
        type="search"
        name={name}
        id={id}
        placeholder={placeholder}
        aria-label={label ?? placeholder}
        defaultValue={defaultValue}
        autoFocus={autoFocus}
      />
    </label>
  );
}

/** A page's way back: a round arrow in the top bar (TopBack); `children` names where it goes. */
export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return <TopBack href={href}>{children}</TopBack>;
}
