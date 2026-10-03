'use client';

import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Icon } from '@/components/app/icons';
import { Button } from '@/components/ui';
import { Segmented } from '@/components/ui/controls';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import type { HomeData } from '@/lib/home-data';
import {
  DENSITIES,
  available,
  defaultLayout,
  deviceFor,
  gridFor,
  locate,
  moveItem,
  normalise,
  pack,
  sizeName,
  sizesOn,
  type Density,
  type Device,
  type Layout,
  type LayoutKind,
  type Placed,
  type WidgetSize,
} from '@/lib/home-grid';
import { ALWAYS, WHEN_NEEDED, catalogFor, type WidgetCtx, type WidgetDef } from './catalog';
import { WxCard } from './pieces';
import { emptySpec } from './widgets';
import { makeFmt } from './fmt';
import {
  markMyShareAction,
  resetHomeLayoutAction,
  saveHomeLayoutAction,
} from '@/app/(app)/home/actions';

/**
 * The Home grid (SCOPE-redesign.md R4): the widgets on pages that fit the
 * screen, sideways paging with dots, and Edit Home: long-press or Edit, then
 * drag (a floating ghost, page flip at the edges), tap a widget for its
 * Small · Medium · Large picker, remove, Add widget (search, a size and a
 * live preview), grid density, Reset. Layouts are saved per
 * person and kind of screen. Keyboard: in edit mode every widget's badge and
 * remove button are buttons; arrow keys on a focused widget move it.
 */
interface Props {
  data: HomeData;
  layouts: Record<Device, Layout>;
  kind: LayoutKind;
}

const isShort = () => typeof window !== 'undefined' && window.innerHeight < 760;

/** Home's slot for Edit Home, beside the date (see the Home page), once the page is in the browser. */
const editSlotEl = () => document.getElementById('home-edit-slot');
const noSubscribe = () => () => {};

export function HomeGrid({ data, layouts: initial, kind }: Props) {
  const editSlot = useSyncExternalStore(noSubscribe, editSlotEl, () => null);
  const t = useTranslations('home');
  const router = useRouter();
  const toast = useToast();
  const f = useMemo(() => makeFmt(data, t), [data, t]);
  const catalog = useMemo(() => catalogFor(data), [data]);
  const byId = useMemo(() => new Map(catalog.map((w) => [w.id, w])), [catalog]);
  const facts = useMemo(
    () => ({ split: data.split, postcode: data.postcode, fresh: data.fresh }),
    [data],
  );

  const [device, setDevice] = useState<Device | null>(null);
  const [short, setShort] = useState(false);
  const [layouts, setLayouts] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [page, setPage] = useState(0);
  const [gallery, setGallery] = useState(false);
  /** The widget whose size picker is open (Edit Home). */
  const [selected, setSelected] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const gridEl = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const read = () => {
      setDevice(deviceFor(window.innerWidth, window.innerHeight));
      setShort(isShort());
    };
    read();
    window.addEventListener('resize', read);
    return () => window.removeEventListener('resize', read);
  }, []);

  const layout = device ? layouts[device] : null;
  const [cols, rows] = device && layout ? gridFor(device, layout.density, kind, short) : [1, 1];

  const update = useCallback(
    (next: Layout) => {
      if (!device) return;
      setLayouts((l) => ({ ...l, [device]: next }));
      startTransition(() => {
        void saveHomeLayoutAction(device, kind, next);
      });
    },
    [device, kind],
  );

  const packed = useMemo(
    () => (layout ? pack(layout.pages, cols, rows) : []),
    [layout, cols, rows],
  );
  const pageCount = Math.max(1, packed.filter((p) => p.length).length + (editing ? 1 : 0));

  // Paging.
  const pageWidth = () => {
    const el = gridEl.current?.querySelector<HTMLElement>('.hg-page');
    const gap = parseFloat(getComputedStyle(gridEl.current!).columnGap) || 0;
    return (el?.getBoundingClientRect().width ?? 0) + gap;
  };
  const goPage = (p: number, smooth = true) => {
    scroller.current?.scrollTo({ left: p * pageWidth(), behavior: smooth ? 'smooth' : 'auto' });
  };
  const onScroll = () => {
    if (!scroller.current) return;
    setPage(Math.round(scroller.current.scrollLeft / (pageWidth() || 1)));
  };

  // Editing.
  const setEdit = (on: boolean) => {
    setEditing(on);
    setSelected(null);
    if (!on && layout) update({ ...layout, pages: layout.pages.filter((p) => p.length) });
  };
  const remove = (id: string) => {
    if (!layout) return;
    const at = locate(layout.pages, id);
    if (!at) return;
    const pages = layout.pages.map((p) => p.slice());
    pages[at.p]!.splice(at.i, 1);
    update({ ...layout, pages: normalise(pages, cols, rows) });
  };
  const setSize = (id: string, size: WidgetSize) => {
    if (!layout) return;
    const at = locate(layout.pages, id);
    const dims = SIZES.find((x) => x.size === size);
    if (!at || !dims) return;
    const pages = layout.pages.map((p) => p.slice());
    pages[at.p]![at.i] = { ...pages[at.p]![at.i]!, w: dims.w, h: dims.h };
    update({ ...layout, pages: normalise(pages, cols, rows) });
  };
  const add = (id: string, w: number, h: number) => {
    if (!layout) return;
    const pages = layout.pages.map((p) => p.slice());
    while (pages.length <= page) pages.push([]);
    pages[page]!.push({ id, w, h });
    const next = normalise(pages, cols, rows);
    update({ ...layout, pages: next });
    setGallery(false);
    const at = locate(next, id);
    if (at) setTimeout(() => goPage(at.p), 50);
  };
  const setDensity = (density: Density) => layout && update({ ...layout, density });
  const reset = () => {
    if (!device) return;
    setLayouts((l) => ({ ...l, [device]: defaultLayout(device, kind, facts) }));
    startTransition(() => {
      void resetHomeLayoutAction(device, kind);
    });
    toast(t('edit.resetDone'));
  };
  // A fresh render from the server (after a refresh) brings the saved layouts back in.
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setLayouts(initial);
  }

  // Keyboard: arrows move a focused widget one block; Delete removes it.
  const onKey = (e: KeyboardEvent<HTMLElement>, it: Placed, p: number) => {
    if (!editing || !layout) return;
    const dirs: Record<string, [number, number]> = {
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
    };
    if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
      e.preventDefault();
      setSelected((cur) => (cur === it.id ? null : it.id));
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      remove(it.id);
      return;
    }
    const d = dirs[e.key];
    if (!d) return;
    e.preventDefault();
    let r = it.r + d[0];
    let c = it.c + d[1];
    let pg = p;
    if (c < 0) {
      if (pg === 0) return;
      pg -= 1;
      c = cols - 1;
    } else if (c >= cols) {
      pg += 1;
      c = 0;
    }
    r = Math.max(0, Math.min(rows - 1, r));
    update({
      ...layout,
      pages: moveItem(layout.pages, packed, it.id, { page: pg, r, c }, cols, rows),
    });
  };

  // Drag: long-press a widget, or any drag in edit mode. The widget lifts
  // into a ghost that follows the pointer; its block stays as a placeholder.
  const drag = useRef<{
    id: string;
    ghost: HTMLElement;
    ox: number;
    oy: number;
    cell: string | null;
    edgeT: number | null;
    /** Where the press began, and whether it has moved: a press that never moves is a tap. */
    sx: number;
    sy: number;
    moved: boolean;
  } | null>(null);
  const press = useRef<{ x: number; y: number; t: number } | null>(null);
  const layoutRef = useRef(layout);
  const packedRef = useRef(packed);
  useEffect(() => {
    layoutRef.current = layout;
    packedRef.current = packed;
  }, [layout, packed]);

  const startDrag = (el: HTMLElement, x: number, y: number, pointerId: number) => {
    const r = el.getBoundingClientRect();
    const ghost = el.cloneNode(true) as HTMLElement;
    ghost.classList.add('drag-ghost');
    ghost.removeAttribute('style');
    ghost.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;`;
    document.body.appendChild(ghost);
    el.classList.add('placeholder');
    drag.current = {
      id: el.dataset.wid!,
      ghost,
      ox: x - r.left,
      oy: y - r.top,
      cell: null,
      edgeT: null,
      sx: x,
      sy: y,
      moved: false,
    };
    try {
      el.setPointerCapture(pointerId);
    } catch {
      /* pointer already released */
    }
  };
  const cellAt = (x: number, y: number) => {
    const g = gridEl.current!.getBoundingClientRect();
    const gap = parseFloat(getComputedStyle(gridEl.current!).columnGap) || 0;
    const pw = pageWidth() - gap;
    const colw = (pw - (cols - 1) * gap) / cols;
    const rowh = (g.height - (rows - 1) * gap) / rows;
    const gc = Math.floor((x - g.left) / (colw + gap));
    const pg = Math.max(0, Math.floor(gc / cols));
    return {
      page: pg,
      c: Math.max(0, Math.min(cols - 1, gc - pg * cols)),
      r: Math.max(0, Math.min(rows - 1, Math.floor((y - g.top) / (rowh + gap)))),
    };
  };
  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    const el = (e.target as Element).closest<HTMLElement>('.widget');
    if ((e.target as Element).closest('[data-hact]')) return;
    // A press anywhere else closes the size picker.
    if (!el) setSelected(null);
    if (!el || e.button > 0) return;
    if (!editing) {
      const { clientX: x, clientY: y, pointerId } = e;
      press.current = {
        x,
        y,
        t: window.setTimeout(() => {
          press.current = null;
          setEditing(true);
          // Start the drag once the widgets have their edit chrome.
          setTimeout(() => {
            const w = gridEl.current?.querySelector<HTMLElement>(
              `.widget[data-wid="${el.dataset.wid}"]`,
            );
            if (w) startDrag(w, x, y, pointerId);
          }, 30);
        }, 520),
      };
      return;
    }
    e.preventDefault();
    startDrag(el, e.clientX, e.clientY, e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    if (press.current && Math.hypot(e.clientX - press.current.x, e.clientY - press.current.y) > 6) {
      clearTimeout(press.current.t);
      press.current = null;
    }
    const d = drag.current;
    if (!d) return;
    if (!d.moved) {
      if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) <= 6) return;
      d.moved = true;
      setSelected(null);
    }
    d.ghost.style.left = `${e.clientX - d.ox}px`;
    d.ghost.style.top = `${e.clientY - d.oy}px`;
    const cell = cellAt(e.clientX, e.clientY);
    const key = `${cell.page}:${cell.c}:${cell.r}`;
    if (d.cell !== key) {
      d.cell = key;
      const cur = layoutRef.current;
      if (cur) {
        const next = moveItem(cur.pages, packedRef.current, d.id, cell, cols, rows);
        if (next !== cur.pages) setLayouts((l) => ({ ...l, [device!]: { ...cur, pages: next } }));
      }
    }
    // Near an edge: flip to the next page after a moment.
    const r = scroller.current!.getBoundingClientRect();
    const near = e.clientX < r.left + 28 ? -1 : e.clientX > r.right - 28 ? 1 : 0;
    if (!near) {
      if (d.edgeT) clearTimeout(d.edgeT);
      d.edgeT = null;
    } else if (!d.edgeT) {
      d.edgeT = window.setTimeout(() => {
        d.edgeT = null;
        goPage(Math.max(0, Math.min(pageCount - 1, page + near)));
      }, 520);
    }
  };
  const endDrag = () => {
    if (press.current) {
      clearTimeout(press.current.t);
      press.current = null;
    }
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    if (d.edgeT) clearTimeout(d.edgeT);
    // A tap, not a drag: open (or close) this widget's size picker.
    if (!d.moved) {
      d.ghost.remove();
      gridEl.current?.querySelector(`.widget[data-wid="${d.id}"]`)?.classList.remove('placeholder');
      setSelected((cur) => (cur === d.id ? null : d.id));
      return;
    }
    const el = gridEl.current?.querySelector<HTMLElement>(`.widget[data-wid="${d.id}"]`);
    if (el) {
      const r = el.getBoundingClientRect();
      d.ghost.classList.add('landing');
      d.ghost.style.left = `${r.left}px`;
      d.ghost.style.top = `${r.top}px`;
      d.ghost.style.width = `${r.width}px`;
      d.ghost.style.height = `${r.height}px`;
    }
    setTimeout(() => {
      d.ghost.remove();
      el?.classList.remove('placeholder');
    }, 240);
    if (layoutRef.current && device) {
      const cur = layoutRef.current;
      startTransition(() => {
        void saveHomeLayoutAction(device, kind, cur);
      });
    }
  };

  const onMarkPaid = (shareId: string, billId: string) => {
    startTransition(() => {
      void markMyShareAction(shareId, billId).then(() => router.refresh());
    });
    toast(t('nextdue.markedPaid'));
  };

  const ctx = (w: number, h: number): WidgetCtx => ({ d: data, w, h, cols, t, f, onMarkPaid });

  const renderWidget = (def: WidgetDef, w: number, h: number): ReactNode => {
    if (data.fresh && !ALWAYS.has(def.id)) return <Empty def={def} w={w} h={h} t={t} />;
    const out = def.render(ctx(w, h));
    return out ?? <Empty def={def} w={w} h={h} t={t} />;
  };

  if (!device || !layout) return <div className="home home-skeleton" aria-busy="true" />;

  const densities = DENSITIES.map((k) => {
    const [c, r] = gridFor(device, k, kind, short);
    return { value: k, label: `${c}×${r}` };
  });
  const onGrid = new Set(layout.pages.flat().map((x) => x.id));
  // Heads-up, the instalment plan and the season ahead are offered only while they have something to show.
  const galleryItems = catalog.filter(
    (w) =>
      !onGrid.has(w.id) &&
      available(w.id, facts) &&
      !(WHEN_NEEDED.has(w.id) && w.render(ctx(2, 1)) === null),
  );

  return (
    <div
      className="home"
      data-editing={editing}
      style={{ ['--cols' as string]: cols, ['--rows' as string]: rows }}
    >
      {editing && (
        <div className="home-edit">
          <Button variant="secondary" size="sm" icon="plus" onClick={() => setGallery(true)}>
            {t('edit.add')}
          </Button>
          {kind === 'home' ? (
            <div className="home-dens">
              <span className="muted small">{t('edit.grid')}</span>
              <Segmented
                small
                items={densities}
                value={layout.density}
                label={t('edit.grid')}
                onChange={(v) => setDensity(v as Density)}
              />
            </div>
          ) : (
            <span className="home-dens" />
          )}
          <Button variant="ghost" size="sm" onClick={reset}>
            {t('edit.reset')}
          </Button>
          <Button size="sm" onClick={() => setEdit(false)}>
            {t('edit.done')}
          </Button>
        </div>
      )}
      <div className="hg-scroller" ref={scroller} onScroll={onScroll}>
        <div
          className="hg"
          ref={gridEl}
          style={{
            ['--cols' as string]: cols,
            ['--rows' as string]: rows,
            gridTemplateColumns: `repeat(${cols * pageCount}, var(--colw))`,
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          {Array.from({ length: pageCount }, (_, p) => (
            <PageSlots key={p} p={p} cols={cols} rows={rows} />
          ))}
          {packed.slice(0, pageCount).map((pg, p) =>
            pg.map((it) => {
              const def = byId.get(it.id);
              if (!def) return null;
              const sizes = sizesOn(def.sizes, cols, rows);
              const style: CSSProperties = {
                gridColumn: `${p * cols + it.c + 1} / span ${it.pw}`,
                gridRow: `${it.r + 1} / span ${it.ph}`,
              };
              return (
                <section
                  key={it.id}
                  className={selected === it.id ? 'widget glass sel' : 'widget glass'}
                  data-wid={it.id}
                  data-w={it.pw}
                  data-h={it.ph}
                  style={style}
                  aria-label={t(`widgets.${def.id.startsWith('svc-') ? 'service' : def.id}.name`, {
                    service: data.services.find((s) => `svc-${s.id}` === def.id)?.name ?? '',
                  })}
                  tabIndex={editing ? 0 : undefined}
                  onKeyDown={(e) => onKey(e, it, p)}
                >
                  <div className="wg-in">{renderWidget(def, it.pw, it.ph)}</div>
                  <button
                    type="button"
                    className="wg-remove"
                    data-hact="remove"
                    onClick={() => remove(it.id)}
                    aria-label={t('edit.remove')}
                  >
                    <Icon name="minus" width={14} height={14} />
                  </button>
                  {editing && selected === it.id && sizes.length > 1 && (
                    <div
                      className={`wg-pick${it.r + it.ph >= rows ? ' up' : ''}${it.c + it.pw >= cols ? ' end' : ''}`}
                      data-hact="size"
                    >
                      <Segmented
                        small
                        label={t('edit.size')}
                        value={sizeName(it.pw, it.ph)}
                        items={SIZES.filter((x) =>
                          sizes.some(([w, h]) => w === x.w && h === x.h),
                        ).map((x) => ({ value: x.size, label: t(`edit.sizes.${x.size}`) }))}
                        onChange={(v) => setSize(it.id, v as WidgetSize)}
                      />
                    </div>
                  )}
                </section>
              );
            }),
          )}
        </div>
      </div>
      <div className="hg-foot">
        <div className="hg-dots" hidden={pageCount <= 1}>
          {Array.from({ length: pageCount }, (_, i) => (
            <button
              key={i}
              type="button"
              className="hg-dot"
              aria-current={i === page ? 'true' : undefined}
              aria-label={t('edit.page', { n: i + 1 })}
              onClick={() => goPage(i)}
            />
          ))}
        </div>
        {!editing &&
          (() => {
            const button = (
              <button type="button" className="hg-edit" onClick={() => setEdit(true)}>
                <Icon name="grid" width={15} height={15} />
                <span>{t('edit.title')}</span>
              </button>
            );
            // On Home it sits at the grid's top right, on the date's line (owner, 2026-10-03).
            return editSlot ? createPortal(button, editSlot) : kind === 'home' ? null : button;
          })()}
      </div>

      <Sheet
        open={gallery}
        onClose={() => setGallery(false)}
        eyebrow={t('edit.homeEyebrow')}
        title={t('edit.addTitle')}
        className="gallery-sheet"
      >
        <AddPanel
          items={galleryItems}
          cols={cols}
          rows={rows}
          render={renderWidget}
          onAdd={add}
          t={t}
          data={data}
        />
      </Sheet>
    </div>
  );
}

/** The page's snap target and, in edit mode, the empty blocks. */
function PageSlots({ p, cols, rows }: { p: number; cols: number; rows: number }) {
  return (
    <>
      <i
        className="hg-page"
        style={{ gridColumn: `${p * cols + 1} / span ${cols}`, gridRow: '1 / -1' }}
      />
      {Array.from({ length: rows * cols }, (_, i) => (
        <i
          key={i}
          className="hg-slot"
          style={{ gridColumn: p * cols + (i % cols) + 1, gridRow: Math.floor(i / cols) + 1 }}
        />
      ))}
    </>
  );
}

const SIZE_OF = { small: 's', medium: 'm', large: 'l' } as const;

/** The three sizes with their blocks, in the order the pickers show them. */
const SIZES: { size: WidgetSize; w: number; h: number }[] = [
  { size: 'small', w: 1, h: 1 },
  { size: 'medium', w: 2, h: 1 },
  { size: 'large', w: 2, h: 2 },
];

/** A widget with nothing to show yet, in the same three sizes. */
function Empty({ def, w, h, t }: { def: WidgetDef; w: number; h: number; t: WidgetCtx['t'] }) {
  const key = def.id.startsWith('svc-') ? 'service' : def.id;
  const spec = emptySpec(
    def.icon,
    t(`widgets.${key}.name`, { service: '' }),
    t(`empty.${key}.title`),
    t(`empty.${key}.body`),
  );
  return <WxCard spec={spec} size={SIZE_OF[sizeName(w, h)]} />;
}

/**
 * Add a widget: search the ones not on Home yet, pick one, choose Small,
 * Medium or Large, see it as it will be, add it.
 */
function AddPanel({
  items,
  cols,
  rows,
  render,
  onAdd,
  t,
  data,
}: {
  items: WidgetDef[];
  cols: number;
  rows: number;
  render: (def: WidgetDef, w: number, h: number) => ReactNode;
  onAdd: (id: string, w: number, h: number) => void;
  t: WidgetCtx['t'];
  data: HomeData;
}) {
  const [q, setQ] = useState('');
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [size, setSize] = useState<WidgetSize>('medium');
  const service = (def: WidgetDef) => data.services.find((s) => `svc-${s.id}` === def.id);
  const key = (def: WidgetDef) => (def.id.startsWith('svc-') ? 'service' : def.id);
  const name = (def: WidgetDef) =>
    t(`widgets.${key(def)}.name`, { service: service(def)?.name ?? '' });
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = items.filter((w) => words.every((x) => name(w).toLowerCase().includes(x)));
  const picked = shown.find((w) => w.id === pickedId) ?? shown[0] ?? null;
  const fits = SIZES.filter((x) => x.w <= cols && x.h <= rows);
  const dims = fits.find((x) => x.size === size) ?? fits[0]!;
  if (items.length === 0) return <p className="muted">{t('edit.allOn')}</p>;
  return (
    <div className="add">
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
      <div className="add-list">
        {shown.map((w) => (
          <button
            key={w.id}
            type="button"
            className="add-pick"
            aria-pressed={picked?.id === w.id}
            onClick={() => setPickedId(w.id)}
          >
            <Icon name={w.icon} width={16} height={16} />
            <span>{name(w)}</span>
          </button>
        ))}
        {shown.length === 0 && <p className="muted small">{t('edit.none')}</p>}
      </div>
      {picked && (
        <>
          <div className="add-about">
            <b>{name(picked)}</b>
            <span className="muted small">
              {t(`widgets.${key(picked)}.desc`, { provider: service(picked)?.provider ?? '' })}
            </span>
          </div>
          <Segmented
            label={t('edit.size')}
            value={dims.size}
            items={fits.map((x) => ({ value: x.size, label: t(`edit.sizes.${x.size}`) }))}
            onChange={(v) => setSize(v as WidgetSize)}
          />
          <div className="add-prev">
            <section
              className="widget glass preview"
              data-w={dims.w}
              data-h={dims.h}
              style={{ ['--pw' as string]: dims.w, ['--ph' as string]: dims.h }}
            >
              <div className="wg-in">{render(picked, dims.w, dims.h)}</div>
            </section>
          </div>
          <Button icon="plus" onClick={() => onAdd(picked.id, dims.w, dims.h)}>
            {t('edit.addToHome')}
          </Button>
        </>
      )}
    </div>
  );
}
