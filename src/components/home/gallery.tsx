'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '@/components/app/icons';
import { Button } from '@/components/ui';
import { Disc } from '@/components/ui/colour';
import { Segmented } from '@/components/ui/controls';
import type { HomeData } from '@/lib/home-data';
import { colourCss } from '@/lib/palette';
import type { Density, WidgetSize } from '@/lib/home-grid';
import type { WidgetCtx, WidgetDef } from './catalog';

/**
 * Add a widget (SCOPE-edit-home.md §3c, the canvas's board E3): a sheet that
 * rises from the bottom of the page in the bar's glass, the grid keeping
 * every column under it. Its head: the title, the hint, the grid's density,
 * Reset and Done. Its body: search and the widgets not on Home in two
 * columns (the ones in the layout the grid has no room for first, as not on
 * screen), and the picked widget drawn at Small, Medium and Large, each with
 * a plus in its corner that adds it to the first free block (E3 makes the
 * sizes draggable onto the grid). Done, Escape or a press on the page
 * outside it closes it (Q6); a press on a widget doesn't, so the grid can
 * be rearranged with the sheet up. On a phone the same sheet stands taller
 * with the sizes stacked.
 */
export const SIZES: { size: WidgetSize; w: number; h: number }[] = [
  { size: 'small', w: 1, h: 1 },
  { size: 'medium', w: 2, h: 1 },
  { size: 'large', w: 2, h: 2 },
];

export function Gallery({
  open,
  onClose,
  items,
  hidden,
  cols,
  rows,
  render,
  onAdd,
  onPick,
  densities,
  density,
  onDensity,
  onReset,
  t,
  data,
}: {
  open: boolean;
  onClose: () => void;
  /** The widgets not in the layout. */
  items: WidgetDef[];
  /** The widgets in the layout the grid has no room for. */
  hidden: WidgetDef[];
  cols: number;
  rows: number;
  render: (def: WidgetDef, w: number, h: number) => ReactNode;
  onAdd: (id: string, w: number, h: number) => void;
  /** The picked widget's blocks (or null), so the grid can mark where it would go. */
  onPick: (dims: { w: number; h: number } | null) => void;
  /** The grid's densities, when the screen has them (Home, not the wall). */
  densities?: { value: Density; label: string }[];
  density: Density;
  onDensity: (d: Density) => void;
  onReset: () => void;
  t: WidgetCtx['t'];
  data: HomeData;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState('');
  const [pickedId, setPickedId] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      const at = e.target as Element;
      if (box.current?.contains(at) || at.closest('.widget, .wg-menu, .toast')) return;
      onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', key);
    };
  }, [open, onClose]);
  if (!open) return null;

  const service = (def: WidgetDef) => data.services.find((s) => `svc-${s.id}` === def.id);
  const key = (def: WidgetDef) => (def.id.startsWith('svc-') ? 'service' : def.id);
  const name = (def: WidgetDef) =>
    t(`widgets.${key(def)}.name`, { service: service(def)?.name ?? '' });
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (w: WidgetDef) => words.every((x) => name(w).toLowerCase().includes(x));
  const all = [...hidden, ...items];
  const picked = all.find((w) => w.id === pickedId) ?? null;
  const fits = SIZES.filter((x) => x.w <= cols && x.h <= rows);
  const pick = (def: WidgetDef) => {
    setPickedId(def.id);
    const d = fits[1] ?? fits[0];
    onPick(d ? { w: d.w, h: d.h } : null);
  };
  const sections: [string, WidgetDef[]][] = [
    [t('edit.secHidden'), hidden.filter(matches)],
    [t('edit.secHousehold'), items.filter((w) => !w.id.startsWith('svc-') && matches(w))],
    [t('edit.secServices'), items.filter((w) => w.id.startsWith('svc-') && matches(w))],
  ];
  const shown = sections.reduce((n, [, ws]) => n + ws.length, 0);
  const row = (w: WidgetDef) => {
    const svc = service(w);
    return (
      <button
        key={w.id}
        type="button"
        className="add-pick"
        aria-pressed={picked?.id === w.id}
        onClick={() => pick(w)}
      >
        {svc ? (
          <i className="add-dot" style={{ ['--svc' as string]: colourCss(svc.colour) }} />
        ) : (
          <Icon name={w.icon} width={16} height={16} />
        )}
        <span>{name(w)}</span>
      </button>
    );
  };
  return (
    <div ref={box} className="hg-sheet" role="dialog" aria-label={t('edit.addTitle')}>
      <div className="hg-sheet-h">
        <h2>{t('edit.addTitle')}</h2>
        <span className="hg-sheet-hint">{t('edit.hint')}</span>
        <span className="hg-sheet-sp" />
        {densities && (
          <Segmented
            small
            items={densities}
            value={density}
            label={t('edit.grid')}
            onChange={(v) => onDensity(v as Density)}
          />
        )}
        <Button variant="secondary" size="sm" onClick={onReset}>
          {t('edit.reset')}
        </Button>
        <Button size="sm" icon="check" onClick={onClose}>
          {t('edit.done')}
        </Button>
      </div>
      <div className="hg-sheet-b">
        <div className="hg-list">
          <label className="search">
            <Icon name="search" width={16} height={16} />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('edit.search')}
              aria-label={t('edit.search')}
            />
          </label>
          <div className="hg-list-in">
            {all.length === 0 && <p className="muted small">{t('edit.allOn')}</p>}
            {all.length > 0 && shown === 0 && <p className="muted small">{t('edit.none')}</p>}
            {sections.map(
              ([title, ws]) =>
                ws.length > 0 && (
                  <div key={title} className="hg-sec">
                    <h3>{title}</h3>
                    <div className="add-list">{ws.map(row)}</div>
                  </div>
                ),
            )}
          </div>
        </div>
        <div className="hg-pv">
          {picked ? (
            <>
              <div className="hg-about">
                {service(picked) ? (
                  <Disc icon={picked.icon} colour={service(picked)!.colour} size="sm" />
                ) : (
                  <span className="hg-about-ic">
                    <Icon name={picked.icon} width={18} height={18} />
                  </span>
                )}
                <div>
                  <b>{name(picked)}</b>
                  <span className="muted small">
                    {t(`widgets.${key(picked)}.desc`, {
                      provider: service(picked)?.provider ?? '',
                    })}
                  </span>
                </div>
              </div>
              <div className="hg-sizes">
                {fits.map((x) => (
                  <div key={x.size} className="hg-size">
                    <section
                      className="widget glass preview"
                      data-w={x.w}
                      data-h={x.h}
                      style={{ ['--pw' as string]: x.w, ['--ph' as string]: x.h }}
                    >
                      <div className="wg-in">{render(picked, x.w, x.h)}</div>
                    </section>
                    <button
                      type="button"
                      className="hg-plus"
                      aria-label={t('edit.addSize', { size: t(`edit.sizes.${x.size}`) })}
                      onClick={() => onAdd(picked.id, x.w, x.h)}
                    >
                      <Icon name="plus" width={14} height={14} />
                    </button>
                    <span className="hg-size-n">{t(`edit.sizes.${x.size}`)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="hg-pv-hint muted">{t('edit.pickHint')}</p>
          )}
        </div>
      </div>
    </div>
  );
}
