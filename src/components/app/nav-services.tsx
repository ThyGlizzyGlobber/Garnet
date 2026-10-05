'use client';

import {
  useRef,
  useState,
  useTransition,
  type DragEvent,
  type FormEvent,
  type ReactNode,
} from 'react';
import { useTranslations } from 'next-intl';
import { saveNavLayoutAction } from '@/app/(app)/nav-actions';
import {
  exampleGroupName,
  MAX_GROUPS,
  type NavGroup,
  type NavLayout,
  type NavLine,
} from '@/lib/nav-layout';
import { Icon } from './icons';
import { useFold } from './nav-section';
import { dragScroll, lowerHalf } from './nav-drag';

export interface NavServicesSection {
  /** null: the services in no group. */
  id: string | null;
  name: string;
  keys: string[];
}

export interface NavServicesRow {
  key: string;
  /** The line itself, drawn by the shell (dot, name, figure; a main service's arrow and services). */
  node: ReactNode;
}

/** The groups and the services in none, the household's and My Services': what this component changes. */
type Arrangement = Omit<NavLayout, 'children'>;
/** The household's services, or My Services (the person's own). */
type Area = 'household' | 'mine';
type Drag = { kind: 'entry'; key: string } | { kind: 'group'; id: string };
type Drop =
  | { kind: 'entry'; sec: string | null; index: number }
  | { kind: 'group'; area: Area; index: number };

/** My Services' services in no group, as a place to drop (a group id never has a colon). */
const MINE = 'mine:';
/** The person's own lines: "ms:…", "mc:…", "mt:…" (src/lib/nav-layout.ts). */
const isMine = (key: string) => key.startsWith('m');

const groupsOf = (secs: NavServicesSection[]): NavGroup[] =>
  secs
    .filter((s): s is NavServicesSection & { id: string } => s.id !== null)
    .map((s) => ({ id: s.id, name: s.name, items: s.keys }));
const looseOf = (secs: NavServicesSection[]) => secs.find((s) => s.id === null)?.keys ?? [];

/**
 * The side menu's services, arranged by dragging (owner, 2026-10-02), in two
 * parts under bold titles: Services (the household's) and, below a rule, My
 * Services (the person's own). Each part is laid out the same way: the
 * person's groups, then the services in none (under "Other Services" once
 * there are groups), then a button for a new group ("New Service Group",
 * "New Personal Group") that opens a name field; the new group is made empty
 * and services are dragged into it. A service or a whole group (by its
 * heading) is dropped where the line shows; a group renames on a
 * double-click of its heading and goes with its ×. The person's own services
 * stay under My Services and the household's under Services. Every change is
 * saved at once; the Services page follows it. Services inside a main
 * service are reordered by NavGroup.
 */
export function NavServices({
  sections,
  mine: mineSections,
  rows,
  lines,
  labels,
}: {
  sections: NavServicesSection[];
  /** My Services: the person's own groups, then their own in no group. */
  mine: NavServicesSection[];
  rows: NavServicesRow[];
  lines: NavLine[];
  labels: { head: string; thisMonth: string; other: string; mine: string };
}) {
  const t = useTranslations('navEdit');
  const [, start] = useTransition();
  // What the server last sent, and a change it hasn't caught up with yet.
  const sent = JSON.stringify([sections, mineSections]);
  const [seen, setSeen] = useState(sent);
  const [saved, setSaved] = useState<Arrangement | null>(null);
  if (seen !== sent) {
    setSeen(sent);
    setSaved(null);
  }
  const [drag, setDrag] = useState<Drag | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);

  const byKey = new Map(rows.map((r) => [r.key, r]));
  const lineOf = new Map(lines.map((l) => [l.key, l]));
  const linesOf = (keys: string[]) =>
    keys.map((k) => lineOf.get(k)).filter((l): l is NavLine => !!l);

  // The arrangement shown, tidied: services that no longer exist dropped, new ones in no group.
  const base: Arrangement = saved ?? {
    groups: groupsOf(sections),
    loose: looseOf(sections),
    mine: looseOf(mineSections),
    mineGroups: groupsOf(mineSections),
  };
  const tidy = (gs: NavGroup[]) =>
    gs.map((g) => ({ ...g, items: g.items.filter((k) => byKey.has(k)) }));
  const groups = tidy(base.groups);
  const mineGroups = tidy(base.mineGroups);
  const placed = new Set([...groups, ...mineGroups].flatMap((g) => g.items));
  const keys = rows.map((r) => r.key);
  const ungrouped = (stored: string[], own: boolean) => [
    ...stored.filter((k) => byKey.has(k) && !placed.has(k) && isMine(k) === own),
    ...keys.filter((k) => isMine(k) === own && !placed.has(k) && !stored.includes(k)),
  ];
  const loose = ungrouped(base.loose, false);
  const mine = ungrouped(base.mine, true);
  const current: Arrangement = { groups, loose, mine, mineGroups };
  const mineIds = new Set(mineGroups.map((g) => g.id));
  const areaOfGroup = (id: string): Area => (mineIds.has(id) ? 'mine' : 'household');
  const isMineSec = (sec: string | null) => sec === MINE || (sec !== null && mineIds.has(sec));

  const commit = (next: Arrangement) => {
    setSaved(next);
    start(() => saveNavLayoutAction(next));
  };
  const listOf = (sec: string | null) =>
    sec === null
      ? loose
      : sec === MINE
        ? mine
        : ([...groups, ...mineGroups].find((g) => g.id === sec)?.items ?? []);
  /** Every list of services, changed by f. */
  const mapLists = (f: (sec: string | null, items: string[]) => string[]): Arrangement => ({
    groups: groups.map((g) => ({ ...g, items: f(g.id, g.items) })),
    loose: f(null, loose),
    mine: f(MINE, mine),
    mineGroups: mineGroups.map((g) => ({ ...g, items: f(g.id, g.items) })),
  });

  /** Move a service to a place in a group, or among the ungrouped (null: the household's; MINE: My Services'). */
  const moveEntry = (key: string, sec: string | null, index: number) => {
    if (isMine(key) !== isMineSec(sec)) return;
    const from = listOf(sec).indexOf(key);
    const at = from >= 0 && from < index ? index - 1 : index;
    if (from === at) return;
    const take = (list: string[]) => list.filter((k) => k !== key);
    const into = (list: string[]) => [...list.slice(0, at), key, ...list.slice(at)];
    commit(mapLists((id, items) => (id === sec ? into(take(items)) : take(items))));
  };
  const moveGroup = (id: string, area: Area, index: number) => {
    if (areaOfGroup(id) !== area) return;
    const list = area === 'mine' ? mineGroups : groups;
    const from = list.findIndex((g) => g.id === id);
    const at = from < index ? index - 1 : index;
    if (from < 0 || from === at) return;
    const rest = list.filter((g) => g.id !== id);
    const next = [...rest.slice(0, at), list[from]!, ...rest.slice(at)];
    commit(area === 'mine' ? { ...current, mineGroups: next } : { ...current, groups: next });
  };
  const removeGroup = (id: string) => {
    const items = [...groups, ...mineGroups].find((x) => x.id === id)?.items ?? [];
    commit(
      areaOfGroup(id) === 'mine'
        ? {
            ...current,
            mineGroups: mineGroups.filter((x) => x.id !== id),
            mine: [...items, ...mine],
          }
        : { ...current, groups: groups.filter((x) => x.id !== id), loose: [...items, ...loose] },
    );
  };
  const rename = (id: string, value: string) => {
    setRenaming(null);
    const name = value.trim();
    const g = [...groups, ...mineGroups].find((x) => x.id === id);
    if (!g || !name || name === g.name) return;
    const named = (gs: NavGroup[]) => gs.map((x) => (x.id === id ? { ...x, name } : x));
    commit({ ...current, groups: named(groups), mineGroups: named(mineGroups) });
  };
  const create = (area: Area, name: string) => {
    const g = { id: freeId([...groups, ...mineGroups]), name, items: [] };
    commit(
      area === 'mine'
        ? { ...current, mineGroups: [...mineGroups, g] }
        : { ...current, groups: [...groups, g] },
    );
  };
  // The name fields' examples, from what's still in no group in each part.
  const example = exampleGroupName(linesOf(loose));
  const mineExample = exampleGroupName(linesOf(mine));

  // Dragging: where it would land, shown as a line.
  const aim = (d: Drop) => {
    if (JSON.stringify(drop) !== JSON.stringify(d)) setDrop(d);
  };
  const endDrag = () => {
    setDrag(null);
    setDrop(null);
  };
  const onDrop = (e: DragEvent) => {
    if (!drag) return;
    e.preventDefault();
    if (drag.kind === 'entry' && drop?.kind === 'entry') moveEntry(drag.key, drop.sec, drop.index);
    if (drag.kind === 'group' && drop?.kind === 'group') moveGroup(drag.id, drop.area, drop.index);
    endDrag();
  };
  const startDrag = (d: Drag) => (e: DragEvent) => {
    e.stopPropagation();
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', d.kind === 'entry' ? d.key : d.id);
    // A group is dragged by its heading, but the whole group goes with the cursor.
    const whole = d.kind === 'group' && (e.currentTarget as HTMLElement).closest('.nav-sec-g');
    if (whole) e.dataTransfer.setDragImage(whole, 16, 16);
    setDrag(d);
  };
  /** A held service may land here: the person's own only under My Services, the household's only under Services. */
  const fits = (sec: string | null) =>
    drag?.kind === 'entry' && isMine(drag.key) === isMineSec(sec);
  /** Over a heading (or an empty group) while a service is held: it goes last in that group. */
  const intoGroup = (sec: string | null, count: number) => (e: DragEvent) => {
    if (!fits(sec)) return;
    e.preventDefault();
    e.stopPropagation();
    aim({ kind: 'entry', sec, index: count });
  };
  /** Over a group while a group of the same part is held: before or after it. */
  const groupOver = (area: Area, index: (e: DragEvent) => number) => (e: DragEvent) => {
    if (drag?.kind !== 'group' || areaOfGroup(drag.id) !== area) return;
    e.preventDefault();
    e.stopPropagation();
    aim({ kind: 'group', area, index: index(e) });
  };

  const entry = (key: string, sec: string | null, i: number, count: number) => {
    const mark =
      drop?.kind === 'entry' && drop.sec === sec
        ? drop.index === i
          ? 'before'
          : drop.index === count && i === count - 1
            ? 'after'
            : undefined
        : undefined;
    return (
      <div
        key={key}
        className="nc-dnd"
        draggable
        data-drop={mark}
        data-dragging={drag?.kind === 'entry' && drag.key === key ? '' : undefined}
        onDragStart={startDrag({ kind: 'entry', key })}
        onDragEnd={endDrag}
        onDragOver={(e) => {
          if (!fits(sec)) return;
          e.preventDefault();
          e.stopPropagation();
          aim({ kind: 'entry', sec, index: i + (lowerHalf(e) ? 1 : 0) });
        }}
      >
        {byKey.get(key)!.node}
      </div>
    );
  };
  const emptyDrop = (sec: string | null) => (
    <div
      className="nc-drop-empty"
      data-drop={drop?.kind === 'entry' && drop.sec === sec ? 'into' : undefined}
      onDragOver={intoGroup(sec, 0)}
    >
      {t('dropHere')}
    </div>
  );
  const groupMark = (area: Area, gi: number, count: number) =>
    drop?.kind === 'group' && drop.area === area
      ? drop.index === gi
        ? 'before'
        : drop.index === count && gi === count - 1
          ? 'after'
          : undefined
      : undefined;

  /** One part of the menu: its groups, its services in no group, and its new-group button. */
  const part = (
    area: Area,
    gs: NavGroup[],
    ungroupedKeys: string[],
    sec: string | null,
    newGroup: { label: string; example: string },
  ) => (
    <>
      {gs.map((g, gi) => (
        <Group
          key={g.id}
          foldId={`grp-${g.id}`}
          name={g.name}
          dropMark={groupMark(area, gi, gs.length)}
          dragging={drag?.kind === 'group' && drag.id === g.id}
          onDragOver={groupOver(area, (e) => gi + (lowerHalf(e) ? 1 : 0))}
          onHeadOver={intoGroup(g.id, g.items.length)}
          headInto={drop?.kind === 'entry' && drop.sec === g.id && drop.index === g.items.length}
          labels={{ show: t('show'), hide: t('hide'), rename: t('renameHint') }}
          drag={{ onDragStart: startDrag({ kind: 'group', id: g.id }), onDragEnd: endDrag }}
          onRename={() => setRenaming({ id: g.id, value: g.name })}
          renameField={
            renaming?.id === g.id && (
              <input
                className="nc-gname"
                autoFocus
                value={renaming.value}
                maxLength={40}
                aria-label={t('groupName')}
                onChange={(e) => setRenaming({ id: g.id, value: e.target.value })}
                onBlur={() => rename(g.id, renaming.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') rename(g.id, renaming.value);
                  if (e.key === 'Escape') setRenaming(null);
                }}
              />
            )
          }
          remove={{
            label: t('remove', { name: g.name }),
            onRemove: () => removeGroup(g.id),
          }}
        >
          {g.items.length
            ? g.items.map((k, i) => entry(k, g.id, i, g.items.length))
            : emptyDrop(g.id)}
        </Group>
      ))}

      {gs.length > 0 ? (
        <Group
          foldId={area === 'mine' ? 'mine-other' : 'other'}
          name={labels.other}
          onDragOver={groupOver(area, () => gs.length)}
          onHeadOver={intoGroup(sec, ungroupedKeys.length)}
          headInto={
            drop?.kind === 'entry' && drop.sec === sec && drop.index === ungroupedKeys.length
          }
          labels={{ show: t('show'), hide: t('hide') }}
        >
          {ungroupedKeys.length
            ? ungroupedKeys.map((k, i) => entry(k, sec, i, ungroupedKeys.length))
            : emptyDrop(sec)}
        </Group>
      ) : (
        <div className="nc-loose" onDragOver={intoGroup(sec, ungroupedKeys.length)}>
          {ungroupedKeys.map((k, i) => entry(k, sec, i, ungroupedKeys.length))}
        </div>
      )}

      {gs.length < MAX_GROUPS && (
        <NewGroup
          label={newGroup.label}
          placeholder={t('newPlaceholder', { name: newGroup.example })}
          create={t('create')}
          fieldLabel={t('groupName')}
          onCreate={(name) => create(area, name)}
        />
      )}
    </>
  );

  return (
    <div
      className="nc-svcs-in"
      onDragOver={(e) => {
        if (!drag) return;
        e.preventDefault();
        dragScroll(e);
      }}
      onDrop={onDrop}
    >
      {/* The household's services and the person's own: a card each where the menu is a stack. */}
      <div className="nc-house glass st-card">
        <div className="nav-sec nc-head">
          <b>{labels.head}</b>
          <span>{labels.thisMonth}</span>
        </div>
        {part('household', groups, loose, null, { label: t('newGroup'), example })}
      </div>

      {mine.length + mineGroups.length > 0 && (
        <div className="nc-mine glass st-card">
          <div className="nav-sec nc-head">
            <b>{labels.mine}</b>
          </div>
          {part('mine', mineGroups, mine, MINE, { label: t('newMineGroup'), example: mineExample })}
        </div>
      )}
    </div>
  );
}

/**
 * "New Service Group" / "New Personal Group": a dashed button (not a
 * heading, so it never reads as the title of what's under it) that opens a
 * name field; Enter makes the group, then services are dragged into it.
 */
function NewGroup({
  label,
  placeholder,
  create,
  fieldLabel,
  onCreate,
}: {
  label: string;
  placeholder: string;
  create: string;
  fieldLabel: string;
  onCreate: (name: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const close = () => {
    setAdding(false);
    setName('');
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onCreate(name.trim());
    close();
  };
  return (
    <div className="nc-newg">
      {adding ? (
        <form className="nc-newg-f" onSubmit={submit}>
          <input
            className="nc-gname"
            autoFocus
            value={name}
            maxLength={40}
            aria-label={fieldLabel}
            placeholder={placeholder}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') close();
            }}
            onBlur={() => !name.trim() && close()}
          />
          {name.trim() && (
            <button type="submit" className="nc-btn">
              {create}
            </button>
          )}
        </form>
      ) : (
        <button type="button" className="nc-newg-b" onClick={() => setAdding(true)}>
          <Icon name="plus" width={14} height={14} />
          {label}
        </button>
      )}
    </div>
  );
}

/** An id no group has had: from the time, so a new group never takes on an old one's fold. */
function freeId(groups: { id: string }[]): string {
  const ids = new Set(groups.map((g) => g.id));
  let n = Date.now();
  while (ids.has(`g${n.toString(36)}`)) n += 1;
  return `g${n.toString(36)}`;
}

/**
 * One group in the menu: a heading that folds it, then its services. A
 * person's own group's heading also drags the group, renames on a
 * double-click and has a × to remove it.
 */
function Group({
  foldId,
  name,
  dropMark,
  dragging,
  headInto,
  onDragOver,
  onHeadOver,
  labels,
  drag,
  onRename,
  renameField,
  remove,
  children,
}: {
  foldId: string;
  name: string;
  dropMark?: 'before' | 'after';
  dragging?: boolean;
  /** A held service would land at the end of this group: a folded group's heading lights up. */
  headInto?: boolean;
  onDragOver: (e: DragEvent) => void;
  onHeadOver: (e: DragEvent) => void;
  labels: { show: string; hide: string; rename?: string };
  drag?: { onDragStart: (e: DragEvent) => void; onDragEnd: () => void };
  onRename?: () => void;
  renameField?: ReactNode;
  /** Its ×: asks "Are you sure?" in the heading itself before the group goes. */
  remove?: { label: string; onRemove: () => void };
  children: ReactNode;
}) {
  const [open, toggle] = useFold(foldId);
  const t = useTranslations('navEdit');
  const [confirming, setConfirming] = useState(false);
  // A click folds it; a double-click renames instead (the fold waits to see which).
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const click = () => {
    if (!onRename) return toggle();
    if (pending.current) {
      clearTimeout(pending.current);
      pending.current = null;
      return onRename();
    }
    pending.current = setTimeout(() => {
      pending.current = null;
      toggle();
    }, 220);
  };
  return (
    <div
      className="nav-sec-g"
      data-open={open ? '' : undefined}
      data-drop={dropMark}
      data-dragging={dragging ? '' : undefined}
      onDragOver={onDragOver}
    >
      <div
        className="nc-gh"
        draggable={!!drag && !renameField && !confirming}
        onDragStart={drag?.onDragStart}
        onDragEnd={drag?.onDragEnd}
        onDragOver={onHeadOver}
        data-drop={headInto && !open ? 'into' : undefined}
      >
        {confirming && remove ? (
          <span className="nc-confirm" role="group" aria-label={remove.label}>
            <span>{t('sure')}</span>
            <button
              type="button"
              className="nc-confirm-yes"
              autoFocus
              onClick={() => {
                setConfirming(false);
                remove.onRemove();
              }}
            >
              {t('imSure')}
            </button>
            <button
              type="button"
              className="nc-confirm-no"
              onClick={() => setConfirming(false)}
              onKeyDown={(e) => e.key === 'Escape' && setConfirming(false)}
            >
              {t('cancel')}
            </button>
          </span>
        ) : (
          renameField || (
            <button
              type="button"
              className="nav-sec nav-sec-t"
              aria-expanded={open}
              aria-label={`${open ? labels.hide : labels.show} · ${name}`}
              title={labels.rename}
              onClick={click}
            >
              <Icon name="chevron-down" width={13} height={13} className="nav-sec-chev" />
              <b>{name}</b>
            </button>
          )
        )}
        {!renameField && !confirming && remove && (
          <span className="nc-gh-act">
            <button
              type="button"
              className="nc-gh-b"
              aria-label={remove.label}
              title={remove.label}
              onClick={() => setConfirming(true)}
            >
              <Icon name="x" width={12} height={12} />
            </button>
          </span>
        )}
      </div>
      {open && children}
    </div>
  );
}
