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
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Icon } from '@/components/app/icons';
import { Button, filterChipClass } from '@/components/ui';
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
  nextSize,
  normalise,
  pack,
  sizesOn,
  type Density,
  type Device,
  type Layout,
  type LayoutKind,
  type Placed,
} from '@/lib/home-grid';
import { ALWAYS, catalogFor, type WidgetCtx, type WidgetDef } from './catalog';
import { makeFmt } from './fmt';
import {
  markMyShareAction,
  resetHomeLayoutAction,
  saveHomeLayoutAction,
} from '@/app/(app)/home/actions';

/**
 * The Home grid (SCOPE-redesign.md R4): the widgets on pages that fit the
 * screen, sideways paging with dots, and Edit Home: long-press or Edit, then
 * drag (a floating ghost, page flip at the edges), the size badge, remove,
 * Add widget with live previews, grid density, Reset. Layouts are saved per
 * person and kind of screen. Keyboard: in edit mode every widget's badge and
 * remove button are buttons; arrow keys on a focused widget move it.
 */
interface Props {
  data: HomeData;
  layouts: Record<Device, Layout>;
  kind: LayoutKind;
}

const isShort = () => typeof window !== 'undefined' && window.innerHeight < 760;

export function HomeGrid({ data, layouts: initial, kind }: Props) {
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
  const resize = (id: string) => {
    if (!layout) return;
    const at = locate(layout.pages, id);
    const def = byId.get(id);
    if (!at || !def) return;
    const pages = layout.pages.map((p) => p.slice());
    const it = pages[at.p]![at.i]!;
    const [w, h] = nextSize(it, def.sizes, cols, rows);
    pages[at.p]![at.i] = { ...it, w, h };
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
    if (!el || e.button > 0 || (e.target as Element).closest('[data-hact]')) return;
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
  const galleryItems = catalog.filter((w) => !onGrid.has(w.id) && available(w.id, facts));

  return (
    <div className="home" data-editing={editing}>
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
                  className="widget glass"
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
                  {sizes.length > 1 && (
                    <button
                      type="button"
                      className="wg-size"
                      data-hact="size"
                      onClick={() => resize(it.id)}
                      aria-label={t('edit.size')}
                    >
                      <Icon name="resize" width={12} height={12} />
                      <span>
                        {it.pw}×{it.ph}
                      </span>
                    </button>
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
        {!editing && (
          <button type="button" className="hg-edit" onClick={() => setEdit(true)}>
            <Icon name="grid" width={15} height={15} />
            <span>{t('edit.title')}</span>
          </button>
        )}
      </div>

      <Sheet
        open={gallery}
        onClose={() => setGallery(false)}
        eyebrow={t('edit.homeEyebrow')}
        title={t('edit.addTitle')}
        className="gallery-sheet"
      >
        <div className="gal">
          {galleryItems.length === 0 && <p className="muted">{t('edit.allOn')}</p>}
          {galleryItems.map((w) => (
            <GalleryItem
              key={w.id}
              def={w}
              cols={cols}
              rows={rows}
              render={renderWidget}
              onAdd={add}
              t={t}
              data={data}
            />
          ))}
        </div>
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

function Empty({ def, w, h, t }: { def: WidgetDef; w: number; h: number; t: WidgetCtx['t'] }) {
  const key = def.id.startsWith('svc-') ? 'service' : def.id;
  return (
    <div className="wg-empty">
      <header className="wg-h">
        <Icon name={def.icon} width={15} height={15} />
        <span className="wg-t">{t(`widgets.${key}.name`, { service: '' })}</span>
      </header>
      <div className="we-body">
        <span className="we-ic">
          <Icon name={def.icon} width={20} height={20} />
        </span>
        <b>{t(`empty.${key}.title`)}</b>
        {(h > 1 || w > 1) && <span className="muted small">{t(`empty.${key}.body`)}</span>}
      </div>
    </div>
  );
}

function GalleryItem({
  def,
  cols,
  rows,
  render,
  onAdd,
  t,
  data,
}: {
  def: WidgetDef;
  cols: number;
  rows: number;
  render: (def: WidgetDef, w: number, h: number) => ReactNode;
  onAdd: (id: string, w: number, h: number) => void;
  t: WidgetCtx['t'];
  data: HomeData;
}) {
  const sizes = sizesOn(def.sizes, cols, rows);
  const [size, setSize] = useState<[number, number]>(sizes[0] ?? [1, 1]);
  const key = def.id.startsWith('svc-') ? 'service' : def.id;
  const service = data.services.find((s) => `svc-${s.id}` === def.id);
  return (
    <div className="gal-item">
      <div className="gal-prev">
        <section
          className="widget glass preview"
          data-w={size[0]}
          data-h={size[1]}
          style={{ ['--pw' as string]: size[0], ['--ph' as string]: size[1] }}
        >
          <div className="wg-in">{render(def, size[0], size[1])}</div>
        </section>
      </div>
      <div className="gal-meta">
        <b>{t(`widgets.${key}.name`, { service: service?.name ?? '' })}</b>
        <span className="muted small">
          {t(`widgets.${key}.desc`, { provider: service?.provider ?? '' })}
        </span>
        <div className="gal-sizes">
          {sizes.map(([w, h]) => (
            <button
              key={`${w}x${h}`}
              type="button"
              className={filterChipClass(w === size[0] && h === size[1])}
              onClick={() => setSize([w, h])}
            >
              {w}×{h}
            </button>
          ))}
        </div>
        <Button size="sm" icon="plus" onClick={() => onAdd(def.id, size[0], size[1])}>
          {t('edit.addOne')}
        </Button>
      </div>
    </div>
  );
}
