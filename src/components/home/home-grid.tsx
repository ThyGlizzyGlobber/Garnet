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
  flow,
  stackGrid,
  STACK_MEDIA,
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
 * The Home grid (SCOPE-redesign.md R4, SCOPE-shell.md §3e–§3g): the widgets
 * on pages that fit the screen, sideways paging with dots. A widget's menu
 * (press and hold, right-click, or the menu key / Shift+F10 on a focused
 * widget) offers Edit Home, Change size and Remove widget; there is no Edit
 * Home button on Home (the account menu has it too, as /?edit=1). Edit Home:
 * drag (a floating ghost, page flip at the edges; dragging after a press and
 * hold starts it), tap a widget for its Small · Medium · Large picker,
 * remove, grid density, Reset, and Add a widget (search, a size and a live
 * preview). On a desktop the edit bar takes over the frame's top line and
 * Add a widget takes a column at the page's left edge until Done; elsewhere the bar sits
 * over the grid and Add widget opens a sheet. Layouts are saved per person
 * and kind of screen. Keyboard: in edit mode arrow keys on a focused widget
 * move it and Delete removes it.
 */
interface Props {
  data: HomeData;
  layouts: Record<Device, Layout>;
  kind: LayoutKind;
}

const isShort = () => typeof window !== 'undefined' && window.innerHeight < 760;

/** The frame's slots Edit Home fills on a desktop (src/components/app/shell.tsx), once the page is in the browser. */
const tbEditEl = () => document.getElementById('tb-edit');
const navAddEl = () => document.getElementById('nav-add');
const noSubscribe = () => () => {};

/** A widget's menu, open at a point on the screen. */
interface WidgetMenu {
  id: string;
  x: number;
  y: number;
}

export function HomeGrid({ data, layouts: initial, kind }: Props) {
  const tbEdit = useSyncExternalStore(noSubscribe, tbEditEl, () => null);
  const navAdd = useSyncExternalStore(noSubscribe, navAddEl, () => null);
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
  /** Whether the menu is the stack of cards (a desktop, or an iPad on its side). */
  const [stack, setStack] = useState(false);
  const [layouts, setLayouts] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [page, setPage] = useState(0);
  const [gallery, setGallery] = useState(false);
  /** The widget whose size picker is open (Edit Home). */
  const [selected, setSelected] = useState<string | null>(null);
  /** A widget's menu (Edit Home · Change size · Remove widget). */
  const [menu, setMenu] = useState<WidgetMenu | null>(null);
  /** The widget picked in Add a widget: its size, so the grid can mark where it would go. */
  const [aiming, setAiming] = useState<{ w: number; h: number } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const gridEl = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const read = () => {
      setDevice(deviceFor(window.innerWidth, window.innerHeight));
      setShort(isShort());
      setStack(window.matchMedia(STACK_MEDIA).matches);
    };
    read();
    // Edit Home from the account menu (/?edit=1): straight into edit mode.
    const fromMenu = () => {
      const url = new URL(window.location.href);
      if (kind !== 'home' || url.searchParams.get('edit') !== '1') return;
      url.searchParams.delete('edit');
      window.history.replaceState(null, '', url.pathname + url.search);
      setEditing(true);
    };
    fromMenu();
    window.addEventListener('resize', read);
    return () => window.removeEventListener('resize', read);
  }, [kind]);

  // The greeting above the grid lines up with it: the page is told how wide the grid is.
  useEffect(() => {
    const el = scroller.current;
    const page = el?.closest<HTMLElement>('.page');
    if (!el || !page) return;
    const tell = () => {
      const cs = getComputedStyle(el);
      const w = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      page.style.setProperty('--home-w', `${Math.round(w)}px`);
    };
    tell();
    const ro = new ResizeObserver(tell);
    ro.observe(el);
    return () => {
      ro.disconnect();
      page.style.removeProperty('--home-w');
    };
  }, [device]);

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
  // When the grid's size changes, the widgets flow onto its pages again, in their order.
  const fitKey = fitted && room ? `${device}:${cols}x${rows}` : '';
  const [flowed, setFlowed] = useState('');
  if (fitKey && flowed !== fitKey && device && layout) {
    setFlowed(fitKey);
    setLayouts((l) => ({ ...l, [device]: { ...layout, pages: flow(layout.pages, cols, rows) } }));
  }

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
  // A page's blocks, and from one page's start to the next (pages sit apart by
  // the scroller's side padding, the room left for the cards' shadows).
  const blocksWidth = () =>
    gridEl.current?.querySelector<HTMLElement>('.hg-page')?.getBoundingClientRect().width ?? 0;
  const pageWidth = () => {
    const side = scroller.current ? parseFloat(getComputedStyle(scroller.current).paddingLeft) : 0;
    return blocksWidth() + 2 * (side || 0);
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
    setMenu(null);
    setAiming(null);
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
    setAiming(null);
    const at = locate(next, id);
    if (at) setTimeout(() => goPage(at.p), 50);
  };
  const setDensity = (density: Density) => layout && update({ ...layout, density });
  const reset = () => {
    if (!device) return;
    const fresh = defaultLayout(device, kind, facts);
    setLayouts((l) => ({
      ...l,
      [device]: fitted ? { ...fresh, pages: flow(fresh.pages, cols, rows) } : fresh,
    }));
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
    setFlowed('');
  }

  // Keyboard: arrows move a focused widget one block; Delete removes it.
  const onKey = (e: KeyboardEvent<HTMLElement>, it: Placed, p: number) => {
    // The menu key, or Shift+F10, on a focused widget opens its menu (SCOPE-shell.md §8 Q8).
    if (
      kind === 'home' &&
      e.target === e.currentTarget &&
      (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10'))
    ) {
      e.preventDefault();
      const r = e.currentTarget.getBoundingClientRect();
      setMenu({ id: it.id, x: r.right - 12, y: r.top + 12 });
      return;
    }
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
  /** A press and hold that opened a widget's menu: moving on from it starts Edit Home with that widget lifted. */
  const held = useRef<{ id: string; x: number; y: number; pointerId: number } | null>(null);
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
    const pw = blocksWidth();
    const colw = (pw - (cols - 1) * gap) / cols;
    const rowh = (g.height - (rows - 1) * gap) / rows;
    const stride = pageWidth() || 1;
    const pg = Math.max(0, Math.floor((x - g.left + (stride - pw) / 2) / stride));
    return {
      page: pg,
      c: Math.max(0, Math.min(cols - 1, Math.floor((x - g.left - pg * stride) / (colw + gap)))),
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
          if (kind !== 'home') return;
          // Press and hold: the widget's menu (SCOPE-shell.md §3f).
          setMenu({ id: el.dataset.wid!, x, y });
          held.current = { id: el.dataset.wid!, x, y, pointerId };
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
    // Held, then moved: into Edit Home, carrying the widget (as on an iPhone).
    const h = held.current;
    if (h && Math.hypot(e.clientX - h.x, e.clientY - h.y) > 10) {
      held.current = null;
      setMenu(null);
      setEditing(true);
      const { clientX: x, clientY: y } = e;
      setTimeout(() => {
        const w = gridEl.current?.querySelector<HTMLElement>(`.widget[data-wid="${h.id}"]`);
        if (w) startDrag(w, x, y, h.pointerId);
      }, 30);
      return;
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
    held.current = null;
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
    const [c, r] = gridOf(k);
    return { value: k, label: `${c}×${r}` };
  });
  // On a desktop Edit Home uses the frame: its bar in the top line, Add a widget in the menu.
  const desk = kind === 'home' && stack && !!tbEdit && !!navAdd;
  // Where a picked widget would go: the first free block on this page it fits in.
  const aimAt = (() => {
    if (!editing || !aiming) return -1;
    const occ = Array.from({ length: rows }, () => Array<boolean>(cols).fill(false));
    for (const it of packed[page] ?? [])
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
  const menuIt = menu ? packed.flat().find((x) => x.id === menu.id) : undefined;
  const menuSizes = menuIt
    ? SIZES.filter((x) =>
        sizesOn(byId.get(menuIt.id)?.sizes ?? [], cols, rows).some(
          ([w, h]) => w === x.w && h === x.h,
        ),
      )
    : [];
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
      ref={homeEl}
      className="home"
      data-editing={editing}
      style={{ ['--cols' as string]: cols, ['--rows' as string]: rows }}
    >
      {editing &&
        (() => {
          const bar = (
            <div className={desk ? 'home-edit on-frame' : 'home-edit'}>
              <div className="home-edit-t">
                <b>{t('edit.title')}</b>
                <span>{t('edit.hint')}</span>
              </div>
              {kind === 'home' && (
                <Segmented
                  small
                  items={densities}
                  value={layout.density}
                  label={t('edit.grid')}
                  onChange={(v) => setDensity(v as Density)}
                />
              )}
              <Button variant="secondary" size="sm" onClick={reset}>
                {t('edit.reset')}
              </Button>
              {/* Under the bar, Add a widget is a column beside the grid while editing (SCOPE-header.md §3f). */}
              {!desk && (
                <Button variant="secondary" size="sm" icon="plus" onClick={() => setGallery(true)}>
                  {t('edit.add')}
                </Button>
              )}
              <Button size="sm" icon="check" onClick={() => setEdit(false)}>
                {t('edit.done')}
              </Button>
            </div>
          );
          return desk ? createPortal(bar, tbEdit!) : bar;
        })()}
      <div className="hg-scroller" ref={scroller} onScroll={onScroll}>
        <div
          className="hg"
          ref={gridEl}
          style={{
            ['--cols' as string]: cols,
            ['--rows' as string]: rows,
            // Each page's blocks, with a spacer track between pages.
            gridTemplateColumns: Array.from(
              { length: pageCount },
              () => `repeat(${cols}, var(--colw))`,
            ).join(' var(--page-gap) '),
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onContextMenu={(e) => {
            if (kind !== 'home' || editing) return;
            const el = (e.target as Element).closest<HTMLElement>('.widget');
            if (!el) return;
            e.preventDefault();
            if (press.current) {
              clearTimeout(press.current.t);
              press.current = null;
            }
            setMenu({ id: el.dataset.wid!, x: e.clientX, y: e.clientY });
          }}
        >
          {Array.from({ length: pageCount }, (_, p) => (
            <PageSlots
              key={p}
              p={p}
              cols={cols}
              rows={rows}
              label={t('edit.drop')}
              aim={p === page ? aimAt : -1}
            />
          ))}
          {packed.slice(0, pageCount).map((pg, p) =>
            pg.map((it) => {
              const def = byId.get(it.id);
              if (!def) return null;
              const sizes = sizesOn(def.sizes, cols, rows);
              const style: CSSProperties = {
                gridColumn: `${p * (cols + 1) + it.c + 1} / span ${it.pw}`,
                gridRow: `${it.r + 1} / span ${it.ph}`,
              };
              return (
                <section
                  key={it.id}
                  className={
                    selected === it.id
                      ? 'widget glass sel'
                      : menu?.id === it.id
                        ? 'widget glass held'
                        : 'widget glass'
                  }
                  data-wid={it.id}
                  data-w={it.pw}
                  data-h={it.ph}
                  style={style}
                  aria-label={t(`widgets.${def.id.startsWith('svc-') ? 'service' : def.id}.name`, {
                    service: data.services.find((s) => `svc-${s.id}` === def.id)?.name ?? '',
                  })}
                  tabIndex={editing || kind === 'home' ? 0 : undefined}
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
        {/* Home has no Edit Home button (SCOPE-shell.md §3f); the wall keeps its own. */}
        {!editing && kind !== 'home' && (
          <button type="button" className="hg-edit" onClick={() => setEdit(true)}>
            <span>{t('edit.title')}</span>
          </button>
        )}
      </div>

      {desk ? (
        editing &&
        createPortal(
          <div className="glass add-card">
            <h2>{t('edit.addTitle')}</h2>
            <AddPanel
              items={galleryItems}
              cols={cols}
              rows={rows}
              render={renderWidget}
              onAdd={add}
              onPick={setAiming}
              t={t}
              data={data}
            />
          </div>,
          navAdd!,
        )
      ) : (
        <Sheet
          open={gallery}
          onClose={() => {
            setGallery(false);
            setAiming(null);
          }}
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
            onPick={setAiming}
            t={t}
            data={data}
          />
        </Sheet>
      )}
      {menu &&
        menuIt &&
        createPortal(
          <WidgetMenuPanel
            at={menu}
            onClose={() => setMenu(null)}
            labels={{
              menu: t('menu.label'),
              edit: t('edit.title'),
              size: t('edit.size'),
              remove: t('menu.remove'),
            }}
            size={sizeName(menuIt.pw, menuIt.ph)}
            sizes={menuSizes.map((x) => ({ value: x.size, label: t(`edit.sizes.${x.size}`) }))}
            onEdit={() => setEdit(true)}
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

/** The page's snap target and, in edit mode, the empty blocks. */
function PageSlots({
  p,
  cols,
  rows,
  label,
  aim,
}: {
  p: number;
  cols: number;
  rows: number;
  label: string;
  /** The block a picked widget would go in (Add a widget), marked; -1 for none. */
  aim: number;
}) {
  return (
    <>
      <i
        className="hg-page"
        style={{ gridColumn: `${p * (cols + 1) + 1} / span ${cols}`, gridRow: '1 / -1' }}
      />
      {Array.from({ length: rows * cols }, (_, i) => (
        <span
          key={i}
          className={i === aim ? 'hg-slot aim' : 'hg-slot'}
          style={{
            gridColumn: p * (cols + 1) + (i % cols) + 1,
            gridRow: Math.floor(i / cols) + 1,
          }}
        >
          <Icon name="plus" width={22} height={22} />
          <span>{label}</span>
        </span>
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
  onPick,
  t,
  data,
}: {
  items: WidgetDef[];
  cols: number;
  rows: number;
  render: (def: WidgetDef, w: number, h: number) => ReactNode;
  onAdd: (id: string, w: number, h: number) => void;
  /** The picked widget's blocks (or null), so the grid can mark where it would go. */
  onPick?: (dims: { w: number; h: number } | null) => void;
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
  // Nothing is picked until someone picks (the design canvas, board Z8): a hint until then.
  const picked = shown.find((w) => w.id === pickedId) ?? null;
  const fits = SIZES.filter((x) => x.w <= cols && x.h <= rows);
  const dims = fits.find((x) => x.size === size) ?? fits[0]!;
  const pick = (id: string | null, sz: WidgetSize = size) => {
    setPickedId(id);
    setSize(sz);
    const d = fits.find((x) => x.size === sz) ?? fits[0]!;
    onPick?.(id ? { w: d.w, h: d.h } : null);
  };
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
            onClick={() => pick(w.id)}
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
            onChange={(v) => pick(picked.id, v as WidgetSize)}
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
      {!picked && shown.length > 0 && <p className="add-hint muted small">{t('edit.pickHint')}</p>}
    </div>
  );
}

/**
 * A widget's menu (SCOPE-shell.md §3f): Edit Home, Change size, Remove
 * widget in red. Opens where it was asked for (the pointer, or the widget's
 * corner from the keyboard), kept on the screen; Escape, a press elsewhere
 * or scrolling closes it, and focus starts on its first item.
 */
function WidgetMenuPanel({
  at,
  onClose,
  labels,
  size,
  sizes,
  onEdit,
  onSize,
  onRemove,
}: {
  at: WidgetMenu;
  onClose: () => void;
  labels: { menu: string; edit: string; size: string; remove: string };
  size: WidgetSize;
  sizes: { value: WidgetSize; label: string }[];
  onEdit: () => void;
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
      <button type="button" role="menuitem" className="wg-menu-i" onClick={onEdit}>
        <Icon name="grid" width={16} height={16} />
        <span>{labels.edit}</span>
      </button>
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
      <hr />
      <button type="button" role="menuitem" className="wg-menu-i bad" onClick={onRemove}>
        <Icon name="minus" width={16} height={16} />
        <span>{labels.remove}</span>
      </button>
    </div>
  );
}
