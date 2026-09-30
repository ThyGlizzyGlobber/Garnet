'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Disc } from '@/components/ui/colour';
import { Button } from '@/components/ui';
import { cx } from '@/components/ui/cx';
import {
  CATEGORY_COLOURS,
  CATEGORY_ICONS,
  somethingElseIn,
  topChoices,
  topKeyOf,
  type TopChoice,
} from '@/lib/service-categories';

export interface PickerType {
  slug: string;
  label: string;
  icon: string;
  colour: string;
  category?: string;
}

/**
 * What kind of service it is, in two small steps laid out like the Services
 * page: first the everyday bill or main service (a tile each), then, for a
 * main service, which kind inside it, "Something else" last. Once chosen the
 * tiles fold into one line with Change. The chosen type is the form's
 * `typeSlug`; '' until a kind is chosen.
 */
export function ServiceTypePicker({
  types,
  value,
  initialTop,
  onChange,
}: {
  types: PickerType[];
  value: string;
  /** Start inside a main service ("cat:health", from its page's Add a service). */
  initialTop?: string | null;
  onChange: (slug: string) => void;
}) {
  const t = useTranslations('services.form');
  const tm = useTranslations('main.main');
  const choices = topChoices(types);
  const current = types.find((ty) => ty.slug === value);
  const [top, setTop] = useState<string | null>(
    current ? topKeyOf(current) : (choices.find((c) => c.key === initialTop)?.key ?? null),
  );
  const [open, setOpen] = useState(!top);
  const choice = choices.find((c) => c.key === top) ?? null;

  const look = (c: TopChoice<PickerType>) =>
    c.category
      ? {
          label: tm(c.category),
          icon: CATEGORY_ICONS[c.category],
          colour: CATEGORY_COLOURS[c.category],
        }
      : {
          label: c.key === 'other' ? t('somethingElse') : c.types[0]!.label,
          icon: c.types[0]!.icon,
          colour: c.types[0]!.colour,
        };
  const kindLabel = (ty: PickerType) => (somethingElseIn(ty.slug) ? t('somethingElse') : ty.label);
  const hint = (slug: string) =>
    t.has(`kinds.${slug}` as never) ? t(`kinds.${slug}` as never) : null;

  const pick = (c: TopChoice<PickerType>) => {
    setTop(c.key);
    setOpen(false);
    if (!c.category) onChange(c.types[0]!.slug);
    else if (!c.types.some((ty) => ty.slug === value)) onChange('');
  };

  const tile = (c: TopChoice<PickerType>) => {
    const l = look(c);
    return (
      <button
        key={c.key}
        type="button"
        className={cx('tpk-opt', top === c.key && 'on')}
        aria-pressed={top === c.key}
        onClick={() => pick(c)}
      >
        <Disc icon={l.icon} colour={l.colour} size="sm" />
        <span>{l.label}</span>
      </button>
    );
  };

  if (open || !choice)
    return (
      <div className="tpk">
        <span className="tpk-sec">{t('essentials')}</span>
        <div className="tpk-grid">{choices.filter((c) => c.essential).map(tile)}</div>
        <span className="tpk-sec">{t('everythingElse')}</span>
        <div className="tpk-grid">{choices.filter((c) => !c.essential).map(tile)}</div>
      </div>
    );

  const l = look(choice);
  const shownHint = choice.category ? (value ? hint(value) : null) : hint(choice.key);
  return (
    <div className="tpk">
      <div className="tpk-sum">
        <Disc icon={l.icon} colour={l.colour} size="sm" />
        <b>{l.label}</b>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
          {t('change')}
        </Button>
      </div>
      {choice.category && (
        <div className="tpk-kinds" role="radiogroup" aria-label={t('whichKind')}>
          <span className="fld-l">{t('whichKind')}</span>
          <div className="tp-list">
            {choice.types.map((ty) => (
              <label key={ty.slug}>
                <input
                  type="radio"
                  name="kind"
                  value={ty.slug}
                  checked={value === ty.slug}
                  onChange={() => onChange(ty.slug)}
                />
                <span className={cx('chip-btn', value === ty.slug && 'on')}>{kindLabel(ty)}</span>
              </label>
            ))}
          </div>
        </div>
      )}
      {shownHint && <span className="fld-h">{shownHint}</span>}
    </div>
  );
}
