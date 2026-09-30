'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Icon } from '@/components/app/icons';
import { Avatar } from '@/components/ui/colour';
import { cx } from '@/components/ui/cx';
import { PALETTE } from '@/lib/palette';

/**
 * The pieces that need a hand: the PIN keypad, the six code boxes, the
 * grouped type picker, the payer pick, the colour dots, and a drop zone that
 * takes files. Each keeps a real input for the form, so nothing needs script
 * to submit.
 */

/** Four to eight digits, typed on the keypad or the keyboard, shown as dots; submits on the last digit when `submitOnFull`. */
export function PinEntry({
  name,
  digits = 4,
  label,
  submitOnFull = false,
  autoFocus = true,
  onFull,
}: {
  name: string;
  digits?: number;
  label: string;
  submitOnFull?: boolean;
  autoFocus?: boolean;
  onFull?: () => void;
}) {
  const t = useTranslations('pinPad');
  const [value, setValue] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const set = (v: string) => {
    const next = v.replace(/\D/g, '').slice(0, 8);
    setValue(next);
    if (next.length === digits) {
      onFull?.();
      if (submitOnFull) setTimeout(() => input.current?.form?.requestSubmit(), 50);
    }
  };
  useEffect(() => {
    if (autoFocus) input.current?.focus();
  }, [autoFocus]);
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];
  return (
    <div className="pin-entry" onClick={() => input.current?.focus()}>
      <input
        ref={input}
        name={name}
        type="password"
        inputMode="numeric"
        autoComplete={name === 'pin' ? 'current-password' : 'new-password'}
        pattern="\d{4,8}"
        value={value}
        onChange={(e) => set(e.target.value)}
        aria-label={label}
        required
      />
      <span className="pin-dots" aria-hidden="true">
        {Array.from({ length: Math.max(digits, value.length) }, (_, i) => (
          <i key={i} className={i < value.length ? 'on' : undefined} />
        ))}
      </span>
      <div className="keypad">
        {keys.map((k, i) =>
          k === '' ? (
            <span key={`k${i}`} />
          ) : (
            <button
              key={`k${i}`}
              type="button"
              className="key"
              aria-label={k === 'del' ? t('delete') : k}
              onClick={() => set(k === 'del' ? value.slice(0, -1) : value + k)}
            >
              {k === 'del' ? <Icon name="chevron-left" width={22} height={22} /> : k}
            </button>
          ),
        )}
      </div>
    </div>
  );
}

/** The six-digit sign-in code as boxes over one input. */
export function CodeBoxes({ name = 'code', label }: { name?: string; label: string }) {
  const [value, setValue] = useState('');
  return (
    <div className="code-in">
      <input
        name={name}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d{6}"
        maxLength={6}
        value={value}
        onChange={(e) => setValue(e.target.value.replace(/\D/g, '').slice(0, 6))}
        aria-label={label}
        autoFocus
        required
      />
      {Array.from({ length: 6 }, (_, i) => (
        <span
          key={i}
          className={cx('code-box', value[i] && 'on', i === value.length && 'cur')}
          aria-hidden="true"
        >
          {value[i] ?? ''}
        </span>
      ))}
    </div>
  );
}

export interface TypeOption {
  slug: string;
  label: string;
}

/** The service types as chips, grouped by what they are; a radio per chip. */
export function TypePicker({
  name,
  groups,
  value,
  onChange,
}: {
  name: string;
  groups: { category: string; label: string; types: TypeOption[] }[];
  value: string;
  onChange: (slug: string) => void;
}) {
  return (
    <div className="type-pick">
      {groups.map((g) => (
        <div key={g.category} className="tp-g">
          <span className="tp-h">{g.label}</span>
          <div className="tp-list">
            {g.types.map((ty) => (
              <label key={ty.slug}>
                <input
                  type="radio"
                  name={name}
                  value={ty.slug}
                  checked={value === ty.slug}
                  onChange={() => onChange(ty.slug)}
                />
                <span className={cx('chip-btn', value === ty.slug && 'on')}>{ty.label}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Who pays the provider: one pill per person, with their avatar. */
export function PayerPick({
  name,
  people,
  value,
  onChange,
  none,
}: {
  name: string;
  people: { id: string; name: string; colour: string }[];
  value: string;
  onChange?: (id: string) => void;
  /** A "nobody in particular" choice, when allowed. */
  none?: string;
}) {
  return (
    <div className="payer-pick">
      {people.map((m) => (
        <label key={m.id} className={cx('payer', value === m.id && 'on')}>
          <input
            type="radio"
            name={name}
            value={m.id}
            checked={value === m.id}
            onChange={() => onChange?.(m.id)}
          />
          <Avatar name={m.name} colour={m.colour} size="sm" />
          <span>{m.name}</span>
        </label>
      ))}
      {none && (
        <label className={cx('payer', value === '' && 'on')}>
          <input
            type="radio"
            name={name}
            value=""
            checked={value === ''}
            onChange={() => onChange?.('')}
          />
          <span>{none}</span>
        </label>
      )}
    </div>
  );
}

/** A colour from the palette, as dots; the current one is ringed. */
export function SwatchPick({
  name,
  value,
  label,
  onChange,
}: {
  name: string;
  value: string;
  label: string;
  onChange?: (hex: string) => void;
}) {
  const [picked, setPicked] = useState(value.toLowerCase());
  const dots = PALETTE.some((p) => p.light.toLowerCase() === picked)
    ? PALETTE
    : [...PALETTE, { name: 'custom', light: picked, dark: picked }];
  return (
    <span className="sw-pick" role="radiogroup" aria-label={label}>
      {dots.map((p) => (
        <label
          key={p.name}
          className={cx('sw-dot', picked === p.light.toLowerCase() && 'on')}
          style={{ ['--c' as string]: p.light }}
          title={p.name}
        >
          <input
            type="radio"
            name={name}
            value={p.light}
            checked={picked === p.light.toLowerCase()}
            onChange={() => {
              setPicked(p.light.toLowerCase());
              onChange?.(p.light);
            }}
            aria-label={p.name}
          />
        </label>
      ))}
    </span>
  );
}

/**
 * A drop zone with a file input under it: drop files, choose them, or on a
 * phone take a photo. Submits the form as soon as files are chosen when
 * `submitOnPick`.
 */
export function DropZone({
  name = 'file',
  accept,
  multiple = false,
  submitOnPick = false,
  big = false,
  icon = 'upload',
  title,
  sub,
  children,
}: {
  name?: string;
  accept?: string;
  multiple?: boolean;
  submitOnPick?: boolean;
  big?: boolean;
  icon?: string;
  title: ReactNode;
  sub?: ReactNode;
  children?: ReactNode;
}) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  return (
    <div
      className={cx('drop glass rounded-card', big && 'big', over && 'over')}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (input.current && e.dataTransfer.files.length) {
          input.current.files = e.dataTransfer.files;
          if (submitOnPick) input.current.form?.requestSubmit();
        }
      }}
    >
      <input
        ref={input}
        type="file"
        name={name}
        accept={accept}
        multiple={multiple}
        required
        onChange={(e) => submitOnPick && e.target.files?.length && e.target.form?.requestSubmit()}
        aria-label={typeof title === 'string' ? title : undefined}
      />
      <span className="drop-ic">
        <Icon name={icon} width={30} height={30} />
      </span>
      <b>{title}</b>
      {sub && <span className="muted">{sub}</span>}
      {children}
    </div>
  );
}
