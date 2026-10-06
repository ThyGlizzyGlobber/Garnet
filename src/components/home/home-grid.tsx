'use client';

import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Icon } from '@/components/app/icons';
import { Segmented } from '@/components/ui/controls';
import { useToast } from '@/components/ui/toast';
import type { HomeData } from '@/lib/home-data';
import {
  DENSITIES,
  addItem,
  available,
  defaultLayout,
  deviceFor,
  gridFor,
  hidden,
  locate,
  moveItem,
  normalise,
  pack,
  sizeName,
  sizesOn,
  stackGrid,
  STACK_MEDIA,
  type Density,
  type Device,
  type Layout,
  type LayoutKind,
  type Placed,
  type WidgetSize,
} from '@/lib/home-grid';
import { ALWAYS, WHEN_NEEDED, catalogFor, type WidgetCtx, type WidgetDef } from './catalog';
import { Gallery, SIZES } from './gallery';
import { WxCard } from './pieces';
import { emptySpec } from './widgets';
import { makeFmt } from './fmt';
import {
  markMyShareAction,
  resetHomeLayoutAction,
  saveHomeLayoutAction,
} from '@/app/(app)/home/actions';

/**
 * The Home grid (SCOPE-redesign.md R4, SCOPE-edit-home.md): the widgets on
 * one page that fits the screen (E-D5). There is no edit mode (E-D1): press
 * a widget and move it and it lifts into a ghost that follows the pointer,
 * its block a hole where it will land, and dropping saves; a press that
 * never moves is a click, which opens the widget. On touch a press and hold
 * opens the widget's menu, and moving on from the hold lifts the widget
 * (E-D6). The menu (press and hold, right-click, or the menu key / Shift+F10
 * on a focused widget) offers Add a widget, Change size and Remove widget;
 * the keyboard moves a focused widget with the arrows and removes it with
 * Delete. Add a widget is the gallery sheet from the bottom (gallery.tsx),
 * reached from the menu, the account menu (/?add=1), or a right-click or
 * press and hold on empty space (Q3). A full grid refuses more and says so;
 * widgets that no longer fit a smaller grid stay in the layout hidden.
 * Layouts are saved per person and kind of screen.
 */
interface Props {
  data: HomeData;
  layouts: Record<Device, Layout>;
  kind: LayoutKind;
}

const isShort = () => typeof window !== 'undefined' && window.innerHeight < 760;

/** A widget's menu, open at a point on the screen. */
interface WidgetMenu {
  id: string;
  x: number;
  y: number;
}

/** How far a press may wander and still be a click, in px. */
const SLOP = 6;
/** A press and hold, in ms. */
const HOLD = 520;

export function HomeGrid({ data, layouts: initial, kind }: Props) {
  const t = useTranslations('home');
  const router = useRouter();
  const toast = useToast();
  const f = useMemo(() => makeFmt(data, t), [data, t]);
  const catalog = useMemo(() => catalogFor(data), [data]);
  const byId = useMemo(() => new Map(catalog.map((w) => [w.id, w])), [catalog]);
  const facts = useMemo(
    () => ({
      split: data.split,
      postcode: data.postcode,
      fresh: data.fresh,
      services: data.services.map((s) => s.id),
    }),
    [data],
  );

  const [device, setDevice] = useState<Device | null>(null);
  const [short, setShort] = useState(false);
  /** Whether the bar's layout is on (a desktop, or an iPad on its side): the grid then fits its room. */
  const [stack, setStack] = useState(false);
  const [layouts, setLayouts] = useState(initial);
  /** The Add a widget sheet. */
  const [gallery, setGallery] = useState(false);
  /** A widget's menu (Add a widget · Change size · Remove widget). */
  const [menu, setMenu] = useState<WidgetMenu | null>(null);
  /** The widget picked in Add a widget: its size, so the grid can mark where it would go. */
  const [aiming, setAiming] = useState<{ w: number; h: number } | null>(null);
  /** A widget is being dragged: the empty blocks show. */
  const [dragging, setDragging] = useState(false);
  const gridEl = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const read = () => {
      setDevice(deviceFor(window.innerWidth, window.innerHeight));
      setShort(isShort());
      setStack(window.matchMedia(STACK_MEDIA).matches);
    };
    read();
    // Add a widget from the account menu (/?add=1): the sheet opens at once.
    const fromMenu = () => {
      const url = new URL(window.location.href);
      if (kind !== 'home' || url.searchParams.get('add') !== '1') return;
      url.searchParams.delete('add');
      window.history.replaceState(null, '', url.pathname + url.search);
      setGallery(true);
    };
    fromMenu();
    window.addEventListener('resize', read);
    return () => window.removeEventListener('resize', read);
  }, [kind]);

  // On the stack the grid fits its room: rows by density, as many square columns as fit.
  const homeEl = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState<{ w: number; h: number; gap: number } | null>(null);
  const fitted = kind === 'home' && stack && (device === 'desktop' || device === 'tabletL');
  useEffect(() => {
    const el = homeEl.current;
    if (!el) return;
    const read = () => {
      const gap = parseFloat(getComputedStyle(el).getPropertyValue('--gap')) || 14;
      setRoom((r) =>
        r && r.w === el.clientWidth && r.h === el.clientHeight && r.gap === gap
          ? r
          : { w: el.clientWidth, h: el.clientHeight, gap },
      );
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [device]);
  const gridOf = (density: Density): [number, number] =>
    !device
      ? [1, 1]
      : fitted && room
        ? stackGrid(density, room.w, room.h, room.gap)
        : gridFor(device, density, kind, short);

  const layout = device ? layouts[device] : null;
  const [cols, rows] = layout ? gridOf(layout.density) : [1, 1];

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
  /** What the grid shows: the widgets that fit; the rest stay hidden in the layout (E-D5). */
  const shown = packed[0] ?? [];
  const notShown = useMemo(() => hidden(packed), [packed]);

  const remove = (id: string) => {
    if (!layout) return;
    const at = locate(layout.pages, id);
    if (!at) return;
    const pages = layout.pages.map((p) => p.slice());
    pages[at.p]!.splice(at.i, 1);
    update({ ...layout, pages: normalise(pages) });
  };
  const setSize = (id: string, size: WidgetSize) => {
    if (!layout) return;
    const at = locate(layout.pages, id);
    const dims = SIZES.find((x) => x.size === size);
    if (!at || !dims) return;
    const pages = layout.pages.map((p) => p.slice());
    pages[at.p]![at.i] = { ...pages[at.p]![at.i]!, w: dims.w, h: dims.h };
    update({ ...layout, pages: normalise(pages) });
  };
  /**
   * A widget added at a block, or the first free one; a full grid says so and
   * adds nothing. A widget already in the layout but hidden (no room) is
   * moved to where it is added, so it shows.
   */
  const add = (id: string, w: number, h: number, cell: { r: number; c: number } | null = null) => {
    if (!layout) return false;
    const base = layout.pages.map((p) => p.filter((x) => x.id !== id));
    const next = addItem(base, { id, w, h }, cell, cols, rows);
    if (!next) {
      toast(t('edit.full'));
      return false;
    }
    update({ ...layout, pages: next });
    return true;
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

  // Keyboard: arrows move a focused widget one block; Delete removes it; the menu key opens its menu.
  const onKey = (e: KeyboardEvent<HTMLElement>, it: Placed) => {
    if (e.target !== e.currentTarget || !layout) return;
    if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
      e.preventDefault();
      const r = e.currentTarget.getBoundingClientRect();
      setMenu({ id: it.id, x: r.right - 12, y: r.top + 12 });
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      remove(it.id);
      return;
    }
    const dirs: Record<string, [number, number]> = {
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
    };
    const d = dirs[e.key];
    if (!d) return;
    e.preventDefault();
    const r = Math.max(0, Math.min(rows - 1, it.r + d[0]));
    const c = Math.max(0, Math.min(cols - 1, it.c + d[1]));
    update({ ...layout, pages: moveItem(layout.pages, packed, it.id, { r, c }, cols) });
  };

  // Moving (E-D1): a press that moves lifts the widget into a ghost that
  // follows the pointer; its block stays as the hole it will land in. With a
  // mouse or pen the lift happens as soon as the press moves; on touch a
  // press and hold opens the menu, and moving on from the hold lifts the
  // widget (E-D6). A press on empty space, held, opens Add a widget (Q3).
  const drag = useRef<{
    id: string;
    ghost: HTMLElement;
    ox: number;
    oy: number;
    cell: string | null;
    moved: boolean;
  } | null>(null);
  /** A press that hasn't become a drag yet: where it began and its hold timer. */
  const press = useRef<{
    el: HTMLElement | null;
    x: number;
    y: number;
    pointerId: number;
    touch: boolean;
    t: number;
  } | null>(null);
  /** A press and hold that opened a widget's menu: moving on from it lifts the widget. */
  const held = useRef<{ id: string; x: number; y: number; pointerId: number } | null>(null);
  /** The click that follows a drag is swallowed, so dropping never opens the widget. */
  const swallowClick = useRef(false);
  const layoutRef = useRef(layout);
  const packedRef = useRef(packed);
  useEffect(() => {
    layoutRef.current = layout;
    packedRef.current = packed;
  }, [layout, packed]);

  const clearPress = () => {
    if (press.current) clearTimeout(press.current.t);
    press.current = null;
  };
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
      moved: false,
    };
    setDragging(true);
    try {
      el.setPointerCapture(pointerId);
    } catch {
      /* pointer already released */
    }
  };
  const cellAt = (x: number, y: number) => {
    const g = gridEl.current!.getBoundingClientRect();
    const gap = parseFloat(getComputedStyle(gridEl.current!).columnGap) || 0;
    const colw = (g.width - (cols - 1) * gap) / cols;
    const rowh = (g.height - (rows - 1) * gap) / rows;
    return {
      c: Math.max(0, Math.min(cols - 1, Math.floor((x - g.left) / (colw + gap)))),
      r: Math.max(0, Math.min(rows - 1, Math.floor((y - g.top) / (rowh + gap)))),
    };
  };
  const moveGhost = (x: number, y: number) => {
    const d = drag.current;
    if (!d) return;
    d.moved = true;
    d.ghost.style.left = `${x - d.ox}px`;
    d.ghost.style.top = `${y - d.oy}px`;
    const cell = cellAt(x, y);
    const key = `${cell.c}:${cell.r}`;
    if (d.cell === key) return;
    d.cell = key;
    const cur = layoutRef.current;
    if (!cur) return;
    const next = moveItem(cur.pages, packedRef.current, d.id, cell, cols);
    if (next !== cur.pages) setLayouts((l) => ({ ...l, [device!]: { ...cur, pages: next } }));
  };
  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    if ((e.target as Element).closest('[data-hact]')) return;
    if (e.button > 0) return;
    const el = (e.target as Element).closest<HTMLElement>('.widget');
    const { clientX: x, clientY: y, pointerId } = e;
    const touch = e.pointerType === 'touch';
    clearPress();
    press.current = {
      el,
      x,
      y,
      pointerId,
      touch,
      t: window.setTimeout(() => {
        press.current = null;
        if (el) {
          // Press and hold: the widget's menu (and on touch, the way to lift it).
          setMenu({ id: el.dataset.wid!, x, y });
          held.current = { id: el.dataset.wid!, x, y, pointerId };
        } else setGallery(true);
      }, HOLD),
    };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    const p = press.current;
    if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > SLOP) {
      clearPress();
      // A mouse or pen that moves lifts the widget at once; a finger is scrolling.
      if (p.el && !p.touch) startDrag(p.el, p.x, p.y, p.pointerId);
    }
    // Held, then moved: the widget lifts (as on an iPhone).
    const h = held.current;
    if (h && Math.hypot(e.clientX - h.x, e.clientY - h.y) > 10) {
      held.current = null;
      setMenu(null);
      const w = gridEl.current?.querySelector<HTMLElement>(`.widget[data-wid="${h.id}"]`);
      if (w) startDrag(w, h.x, h.y, h.pointerId);
    }
    if (drag.current) moveGhost(e.clientX, e.clientY);
  };
  const endDrag = () => {
    held.current = null;
    clearPress();
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    setDragging(false);
    const el = gridEl.current?.querySelector<HTMLElement>(`.widget[data-wid="${d.id}"]`);
    if (!d.moved) {
      d.ghost.remove();
      el?.classList.remove('placeholder');
      return;
    }
    swallowClick.current = true;
    setTimeout(() => (swallowClick.current = false), 0);
    // The ghost settles onto its block, then goes.
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
  const onClickCapture = (e: ReactMouseEvent<HTMLElement>) => {
    if (!swallowClick.current) return;
    swallowClick.current = false;
    e.preventDefault();
    e.stopPropagation();
  };
  const onContextMenu = (e: ReactMouseEvent<HTMLElement>) => {
    e.preventDefault();
    clearPress();
    const el = (e.target as Element).closest<HTMLElement>('.widget');
    if (el) setMenu({ id: el.dataset.wid!, x: e.clientX, y: e.clientY });
    else setGallery(true);
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
    const [c, r] = gridOf(k);
    return { value: k, label: `${c}×${r}` };
  });
  // Where a picked widget would go: the first free block it fits in.
  const aimAt = (() => {
    if (!gallery || !aiming) return -1;
    const occ = Array.from({ length: rows }, () => Array<boolean>(cols).fill(false));
    for (const it of shown)
      for (let y = it.r; y < it.r + it.ph; y++)
        for (let x = it.c; x < it.c + it.pw; x++) occ[y]![x] = true;
    for (let r = 0; r + aiming.h <= rows; r++)
      for (let c = 0; c + aiming.w <= cols; c++) {
        let free = true;
        for (let y = r; y < r + aiming.h && free; y++)
          for (let x = c; x < c + aiming.w && free; x++) if (occ[y]![x]) free = false;
        if (free) return r * cols + c;
      }
    return -1;
  })();
  const menuIt = menu ? shown.find((x) => x.id === menu.id) : undefined;
  const menuSizes = menuIt
    ? SIZES.filter((x) =>
        sizesOn(byId.get(menuIt.id)?.sizes ?? [], cols, rows).some(
          ([w, h]) => w === x.w && h === x.h,
        ),
      )
    : [];
  const inLayout = new Set(layout.pages.flat().map((x) => x.id));
  // Heads-up, the instalment plan and the season ahead are offered only while they have something to show.
  const galleryItems = catalog.filter(
    (w) =>
      !inLayout.has(w.id) &&
      available(w.id, facts) &&
      !(WHEN_NEEDED.has(w.id) && w.render(ctx(2, 1)) === null),
  );
  const closeGallery = () => {
    setGallery(false);
    setAiming(null);
  };

  return (
    <div
      ref={homeEl}
      className="home"
      data-dragging={dragging || undefined}
      data-sheet={gallery || undefined}
      style={{ ['--cols' as string]: cols, ['--rows' as string]: rows }}
    >
      <div className="hg-scroller">
        <div
          className="hg"
          ref={gridEl}
          style={{
            ['--cols' as string]: cols,
            ['--rows' as string]: rows,
            gridTemplateColumns: `repeat(${cols}, var(--colw))`,
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onClickCapture={onClickCapture}
          onContextMenu={onContextMenu}
          onDragStart={(e) => e.preventDefault()}
        >
          <Slots cols={cols} rows={rows} label={t('edit.drop')} aim={aimAt} />
          {shown.map((it) => {
            const def = byId.get(it.id);
            if (!def) return null;
            const style: CSSProperties = {
              gridColumn: `${it.c + 1} / span ${it.pw}`,
              gridRow: `${it.r + 1} / span ${it.ph}`,
            };
            return (
              <section
                key={it.id}
                className={menu?.id === it.id ? 'widget glass held' : 'widget glass'}
                data-wid={it.id}
                data-w={it.pw}
                data-h={it.ph}
                style={style}
                aria-label={t(`widgets.${def.id.startsWith('svc-') ? 'service' : def.id}.name`, {
                  service: data.services.find((s) => `svc-${s.id}` === def.id)?.name ?? '',
                })}
                tabIndex={0}
                onKeyDown={(e) => onKey(e, it)}
              >
                <div className="wg-in">{renderWidget(def, it.pw, it.ph)}</div>
              </section>
            );
          })}
        </div>
        {/* The wall has no menu to reach the sheet from across a room: a button. */}
        {kind !== 'home' && (
          <button type="button" className="hg-edit" onClick={() => setGallery(true)}>
            <span>{t('edit.addTitle')}</span>
          </button>
        )}
      </div>

      <Gallery
        open={gallery}
        onClose={closeGallery}
        items={galleryItems}
        hidden={notShown.map((x) => byId.get(x.id)).filter((x): x is WidgetDef => !!x)}
        cols={cols}
        rows={rows}
        render={renderWidget}
        onAdd={(id, w, h) => {
          if (add(id, w, h)) setAiming(null);
        }}
        onPick={setAiming}
        densities={kind === 'home' ? densities : undefined}
        density={layout.density}
        onDensity={setDensity}
        onReset={reset}
        t={t}
        data={data}
      />
      {menu &&
        menuIt &&
        createPortal(
          <WidgetMenuPanel
            at={menu}
            onClose={() => setMenu(null)}
            labels={{
              menu: t('menu.label'),
              add: t('edit.addTitle'),
              size: t('edit.size'),
              remove: t('menu.remove'),
            }}
            size={sizeName(menuIt.pw, menuIt.ph)}
            sizes={menuSizes.map((x) => ({ value: x.size, label: t(`edit.sizes.${x.size}`) }))}
            onAdd={() => {
              setMenu(null);
              setGallery(true);
            }}
            onSize={(v) => setSize(menuIt.id, v)}
            onRemove={() => {
              setMenu(null);
              remove(menuIt.id);
            }}
          />,
          document.body,
        )}
    </div>
  );
}

/** The grid's empty blocks, shown while something is dragged or the sheet is open. */
function Slots({
  cols,
  rows,
  label,
  aim,
}: {
  cols: number;
  rows: number;
  label: string;
  /** The block a picked widget would go in (Add a widget), marked; -1 for none. */
  aim: number;
}) {
  return (
    <>
      {Array.from({ length: rows * cols }, (_, i) => (
        <span
          key={i}
          className={i === aim ? 'hg-slot aim' : 'hg-slot'}
          style={{ gridColumn: (i % cols) + 1, gridRow: Math.floor(i / cols) + 1 }}
        >
          <Icon name="plus" width={22} height={22} />
          <span>{label}</span>
        </span>
      ))}
    </>
  );
}

const SIZE_OF = { small: 's', medium: 'm', large: 'l' } as const;

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
 * A widget's menu (SCOPE-shell.md §3f, SCOPE-edit-home.md §3b): Add a
 * widget, Change size, Remove widget in red. Opens where it was asked for
 * (the pointer, or the widget's corner from the keyboard), kept on the
 * screen; Escape, a press elsewhere or scrolling closes it, and focus starts
 * on its first item.
 */
function WidgetMenuPanel({
  at,
  onClose,
  labels,
  size,
  sizes,
  onAdd,
  onSize,
  onRemove,
}: {
  at: WidgetMenu;
  onClose: () => void;
  labels: { menu: string; add: string; size: string; remove: string };
  size: WidgetSize;
  sizes: { value: WidgetSize; label: string }[];
  onAdd: () => void;
  onSize: (size: WidgetSize) => void;
  onRemove: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: at.x, top: at.y });
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const fit = {
      left: Math.max(12, Math.min(at.x, window.innerWidth - r.width - 12)),
      top: Math.max(12, Math.min(at.y, window.innerHeight - r.height - 12)),
    };
    if (fit.left !== pos.left || fit.top !== pos.top) setPos(fit);
    el.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [at, pos]);
  useEffect(() => {
    const away = (e: Event) => {
      if (!box.current?.contains(e.target as Node)) onClose();
    };
    const key = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', key);
    window.addEventListener('scroll', onClose, true);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', key);
      window.removeEventListener('scroll', onClose, true);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);
  return (
    <div
      ref={box}
      className="wg-menu"
      role="menu"
      aria-label={labels.menu}
      style={{ left: pos.left, top: pos.top }}
    >
      {sizes.length > 1 && (
        <div className="wg-menu-size">
          <span>
            <Icon name="resize" width={16} height={16} />
            {labels.size}
          </span>
          <Segmented
            small
            label={labels.size}
            value={size}
            items={sizes}
            onChange={(v) => onSize(v as WidgetSize)}
          />
        </div>
      )}
      <button type="button" role="menuitem" className="wg-menu-i" onClick={onAdd}>
        <Icon name="plus" width={16} height={16} />
        <span>{labels.add}</span>
      </button>
      <hr />
      <button type="button" role="menuitem" className="wg-menu-i bad" onClick={onRemove}>
        <Icon name="minus" width={16} height={16} />
        <span>{labels.remove}</span>
      </button>
    </div>
  );
}
