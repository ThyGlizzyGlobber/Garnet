'use client';

import { useState, useTransition, type DragEvent, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { saveNavLayoutAction } from '@/app/(app)/nav-actions';
import { suggestGroupName, MAX_GROUPS, type NavLayout, type NavLine } from '@/lib/nav-layout';
import { Icon } from './icons';
import { useFold } from './nav-section';

export interface NavServicesSection {
  /** null: the services in no group (always last). */
  id: string | null;
  name: string;
  keys: string[];
}

export interface NavServicesRow {
  key: string;
  name: string;
  /** Its colour, as CSS. */
  colour: string;
  /** The line itself, drawn by the shell (dot, name, figure; a main service's arrow). */
  node: ReactNode;
}

type Drag = { kind: 'entry'; key: string } | { kind: 'group'; id: string };
/** My Services as a place to drop (a group id never has a colon). */
const MINE = 'mine:';
/** The person's own lines: "ms:…", "mc:…", "mt:…" (src/lib/nav-layout.ts). */
const isMine = (key: string) => key.startsWith('m');
type Drop = { kind: 'entry'; sec: string | null; index: number } | { kind: 'group'; index: number };

/**
 * The side menu's services, arranged in place (owner, 2026-10-02). The
 * pencil beside "Services" starts editing: every service gets a tick-box,
 * and ticking some offers a name for a new group (suggested from what's
 * ticked: "e.g. Essentials"). While editing, services and whole groups are
 * dragged where they should go (a line shows where they'll land), groups are
 * renamed in place and removed with their ×, their services going back
 * under Other Services. "Group 5 services" saves the new group at once; the
 * pencil becomes a tick that saves the rest and stops editing; Escape leaves
 * without saving what isn't saved yet. My Services, the person's own, is always last: it
 * isn't renamed or removed, and only its order changes (its services can't
 * leave it, nor others join it). The Services page follows the same order.
 */
export function NavServices({
  sections,
  mine: mineKeys,
  rows,
  lines,
  labels,
}: {
  sections: NavServicesSection[];
  /** My Services, in the person's order. */
  mine: string[];
  rows: NavServicesRow[];
  lines: NavLine[];
  labels: { head: string; thisMonth: string; other: string; mine: string };
}) {
  const t = useTranslations('navEdit');
  const [, start] = useTransition();
  // What the server last sent, and a saved change it hasn't caught up with yet.
  const sent = JSON.stringify([sections, mineKeys]);
  const [seen, setSeen] = useState(sent);
  const [saved, setSaved] = useState<NavLayout | null>(null);
  if (seen !== sent) {
    setSeen(sent);
    setSaved(null);
  }
  // While editing: the arrangement being made, the services ticked and the new group's name.
  const [draft, setDraft] = useState<NavLayout | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [newName, setNewName] = useState('');
  const [drag, setDrag] = useState<Drag | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);
  const editing = draft !== null;

  const byKey = new Map(rows.map((r) => [r.key, r]));
  const lineOf = new Map(lines.map((l) => [l.key, l]));
  const suggest = (keys: string[]) =>
    suggestGroupName(keys.map((k) => lineOf.get(k)).filter((l): l is NavLine => !!l));

  // The arrangement shown, tidied: services that no longer exist dropped, new ones under Other Services.
  const base: NavLayout = draft ??
    saved ?? {
      groups: sections
        .filter((s): s is NavServicesSection & { id: string } => s.id !== null)
        .map((s) => ({ id: s.id, name: s.name, items: s.keys })),
      loose: sections.find((s) => s.id === null)?.keys ?? [],
      mine: mineKeys,
    };
  const groups = base.groups.map((g) => ({ ...g, items: g.items.filter((k) => byKey.has(k)) }));
  const placed = new Set(groups.flatMap((g) => g.items));
  const keys = rows.map((r) => r.key);
  const loose = [
    ...base.loose.filter((k) => byKey.has(k) && !placed.has(k)),
    ...keys.filter((k) => !isMine(k) && !placed.has(k) && !base.loose.includes(k)),
  ];
  const mine = [
    ...base.mine.filter((k) => byKey.has(k)),
    ...keys.filter((k) => isMine(k) && !base.mine.includes(k)),
  ];
  const current: NavLayout = { groups, loose, mine };

  const listOf = (sec: string | null) =>
    sec === null ? loose : sec === MINE ? mine : (groups.find((g) => g.id === sec)?.items ?? []);
  const ordered = (keys: string[]) =>
    [...groups.flatMap((g) => g.items), ...loose].filter((k) => keys.includes(k));

  /** The ticked services as a new group, after the others. */
  const withNewGroup = (l: NavLayout): NavLayout => {
    if (!picked.length || l.groups.length >= MAX_GROUPS) return l;
    const items = ordered(picked);
    return {
      groups: [
        ...l.groups.map((g) => ({ ...g, items: g.items.filter((k) => !items.includes(k)) })),
        { id: freeId(l.groups), name: newName.trim() || suggest(items), items },
      ],
      loose: l.loose.filter((k) => !items.includes(k)),
      mine: l.mine,
    };
  };
  /** Unnamed groups take the name suggested for them; then it's kept. */
  const save = (next: NavLayout) => {
    const named = {
      ...next,
      groups: next.groups.map((g) => ({ ...g, name: g.name.trim() || suggest(g.items) })),
    };
    setSaved(named);
    start(() => saveNavLayoutAction(named));
    return named;
  };
  /** "Group 5 services": the new group is saved at once, and editing carries on. */
  const addGroup = () => {
    setDraft(save(withNewGroup(current)));
    setPicked([]);
    setNewName('');
  };

  const begin = () => {
    setDraft(current);
    setPicked([]);
    setNewName('');
  };
  /** The tick: save everything and stop editing. */
  const finish = () => {
    save(withNewGroup(current));
    setDraft(null);
    setPicked([]);
  };
  const cancel = () => {
    setDraft(null);
    setPicked([]);
  };

  /** Move a service to a place in a group (or under Other Services: null). */
  const moveEntry = (key: string, sec: string | null, index: number) => {
    // My Services keeps its own, and only its own.
    if (isMine(key) !== (sec === MINE)) return;
    const from = listOf(sec).indexOf(key);
    const at = from >= 0 && from < index ? index - 1 : index;
    const take = (list: string[]) => list.filter((k) => k !== key);
    const into = (list: string[]) => [...list.slice(0, at), key, ...list.slice(at)];
    setDraft({
      groups: groups.map((g) => ({
        ...g,
        items: g.id === sec ? into(take(g.items)) : take(g.items),
      })),
      loose: sec === null ? into(take(loose)) : take(loose),
      mine: sec === MINE ? into(take(mine)) : mine,
    });
  };
  const moveGroup = (id: string, index: number) => {
    const from = groups.findIndex((g) => g.id === id);
    if (from < 0) return;
    const at = from < index ? index - 1 : index;
    const rest = groups.filter((g) => g.id !== id);
    setDraft({ groups: [...rest.slice(0, at), groups[from]!, ...rest.slice(at)], loose, mine });
  };
  const removeGroup = (id: string) => {
    const g = groups.find((x) => x.id === id);
    setDraft({
      groups: groups.filter((x) => x.id !== id),
      loose: [...(g?.items ?? []), ...loose],
      mine,
    });
  };
  const renameGroup = (id: string, name: string) =>
    setDraft({ groups: groups.map((x) => (x.id === id ? { ...x, name } : x)), loose, mine });

  // Dragging (while editing): where it would land, shown as a line.
  const aim = (d: Drop) => {
    if (JSON.stringify(drop) !== JSON.stringify(d)) setDrop(d);
  };
  const lower = (e: DragEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return e.clientY > r.top + r.height / 2;
  };
  const endDrag = () => {
    setDrag(null);
    setDrop(null);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    if (drag?.kind === 'entry' && drop?.kind === 'entry') moveEntry(drag.key, drop.sec, drop.index);
    if (drag?.kind === 'group' && drop?.kind === 'group') moveGroup(drag.id, drop.index);
    endDrag();
  };
  const startDrag = (d: Drag) => (e: DragEvent) => {
    e.stopPropagation();
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', d.kind === 'entry' ? d.key : d.id);
    // A group is dragged by its grip, but the whole group goes with the cursor.
    const whole = d.kind === 'group' && (e.currentTarget as HTMLElement).closest('.nav-sec-g');
    if (whole) e.dataTransfer.setDragImage(whole, 16, 16);
    setDrag(d);
  };
  /** A held service may land here: the person's own only in My Services, the rest anywhere else. */
  const fits = (sec: string | null) =>
    drag?.kind === 'entry' && isMine(drag.key) === (sec === MINE);
  /** Over a heading (or an empty group) while a service is held: it goes last in that group. */
  const intoGroup = (sec: string | null, count: number) => (e: DragEvent) => {
    if (!fits(sec)) return;
    e.preventDefault();
    e.stopPropagation();
    aim({ kind: 'entry', sec, index: count });
  };
  const groupOver = (index: (e: DragEvent) => number) => (e: DragEvent) => {
    if (drag?.kind !== 'group') return;
    e.preventDefault();
    aim({ kind: 'group', index: index(e) });
  };

  const entry = (key: string, sec: string | null, i: number, count: number) => {
    const r = byKey.get(key)!;
    if (!editing) return <div key={key}>{r.node}</div>;
    const mark =
      drop?.kind === 'entry' && drop.sec === sec
        ? drop.index === i
          ? 'before'
          : drop.index === count && i === count - 1
            ? 'after'
            : undefined
        : undefined;
    const on = picked.includes(key);
    return (
      <label
        key={key}
        className="nc-s nc-pick"
        draggable
        data-drop={mark}
        data-on={on ? '' : undefined}
        data-dragging={drag?.kind === 'entry' && drag.key === key ? '' : undefined}
        onDragStart={startDrag({ kind: 'entry', key })}
        onDragEnd={endDrag}
        onDragOver={(e) => {
          if (!fits(sec)) return;
          e.preventDefault();
          e.stopPropagation();
          aim({ kind: 'entry', sec, index: i + (lower(e) ? 1 : 0) });
        }}
      >
        {/* My Services can't be grouped: no tick-box, only its order. */}
        {sec === MINE ? (
          <span className="nc-pick-x" />
        ) : (
          <input
            type="checkbox"
            checked={on}
            aria-label={t('pick', { name: r.name })}
            onChange={() => setPicked(on ? picked.filter((k) => k !== key) : [...picked, key])}
          />
        )}
        <i style={{ ['--svc' as string]: r.colour }} aria-hidden="true" />
        <span>{r.name}</span>
        <Icon name="move" width={13} height={13} className="nc-grip" />
      </label>
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
  const groupMark = (gi: number) =>
    drop?.kind === 'group'
      ? drop.index === gi
        ? 'before'
        : drop.index === groups.length && gi === groups.length - 1
          ? 'after'
          : undefined
      : undefined;

  return (
    <div
      className="nc-svcs-in"
      data-editing={editing ? '' : undefined}
      onDragOver={(e) => drag && e.preventDefault()}
      onDrop={onDrop}
      onKeyDown={(e) => {
        if (editing && e.key === 'Escape') cancel();
      }}
    >
      {/* The heading and, while editing, the new group's name stay in view as the list scrolls. */}
      <div className="nc-top">
        <div className="nav-sec nc-head">
          <b>{labels.head}</b>
          <span>{editing ? t('editing') : labels.thisMonth}</span>
          <button
            type="button"
            className={`nc-edit${editing ? ' is-on' : ''}`}
            onClick={editing ? finish : begin}
            aria-label={editing ? t('save') : t('edit')}
            title={editing ? t('save') : t('edit')}
          >
            <Icon name={editing ? 'check' : 'pencil'} width={13} height={13} />
          </button>
        </div>

        {editing && (
          <div className="nc-newg">
            {picked.length ? (
              <>
                <input
                  className="nc-gname"
                  autoFocus
                  value={newName}
                  maxLength={40}
                  aria-label={t('groupName')}
                  placeholder={t('placeholder', { name: suggest(ordered(picked)) })}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addGroup();
                  }}
                />
                <button
                  type="button"
                  className="nc-btn"
                  onClick={addGroup}
                  disabled={groups.length >= MAX_GROUPS}
                >
                  {t('addGroup', { count: picked.length })}
                </button>
              </>
            ) : (
              <p>{t('hint')}</p>
            )}
          </div>
        )}
      </div>

      {groups.map((g, gi) => (
        <Group
          key={g.id}
          foldId={`grp-${g.id}`}
          name={g.name || suggest(g.items)}
          editing={editing}
          dropMark={groupMark(gi)}
          dragging={drag?.kind === 'group' && drag.id === g.id}
          onDragOver={groupOver((e) => gi + (lower(e) ? 1 : 0))}
          onHeadOver={intoGroup(g.id, g.items.length)}
          labels={{ show: t('show'), hide: t('hide') }}
          editHead={
            <>
              <span
                className="nc-grip-g"
                draggable
                onDragStart={startDrag({ kind: 'group', id: g.id })}
                onDragEnd={endDrag}
                aria-hidden="true"
              >
                <Icon name="move" width={13} height={13} />
              </span>
              <input
                className="nc-gname"
                value={g.name}
                maxLength={40}
                aria-label={t('groupName')}
                placeholder={t('placeholder', { name: suggest(g.items) })}
                onChange={(e) => renameGroup(g.id, e.target.value)}
              />
              <button
                type="button"
                className="nc-gh-b"
                aria-label={t('remove', { name: g.name || suggest(g.items) })}
                title={t('remove', { name: g.name || suggest(g.items) })}
                onClick={() => removeGroup(g.id)}
              >
                <Icon name="x" width={12} height={12} />
              </button>
            </>
          }
        >
          {g.items.length
            ? g.items.map((k, i) => entry(k, g.id, i, g.items.length))
            : emptyDrop(g.id)}
        </Group>
      ))}

      {groups.length > 0 ? (
        <Group
          foldId="other"
          name={labels.other}
          editing={editing}
          onDragOver={groupOver(() => groups.length)}
          onHeadOver={intoGroup(null, loose.length)}
          labels={{ show: t('show'), hide: t('hide') }}
        >
          {loose.length ? loose.map((k, i) => entry(k, null, i, loose.length)) : emptyDrop(null)}
        </Group>
      ) : (
        <div className="nc-loose" onDragOver={intoGroup(null, loose.length)}>
          {loose.map((k, i) => entry(k, null, i, loose.length))}
        </div>
      )}

      {mine.length > 0 && (
        <Group
          foldId="mine"
          name={labels.mine}
          editing={editing}
          onDragOver={groupOver(() => groups.length)}
          onHeadOver={intoGroup(MINE, mine.length)}
          labels={{ show: t('show'), hide: t('hide') }}
        >
          {mine.map((k, i) => entry(k, MINE, i, mine.length))}
        </Group>
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

/** One group in the menu: a heading that folds it (or, while editing, names and drags it), then its services. */
function Group({
  foldId,
  name,
  editing,
  editHead,
  dropMark,
  dragging,
  onDragOver,
  onHeadOver,
  labels,
  children,
}: {
  foldId: string;
  name: string;
  editing: boolean;
  /** The heading while editing (Other Services keeps its plain one). */
  editHead?: ReactNode;
  dropMark?: 'before' | 'after';
  dragging?: boolean;
  onDragOver: (e: DragEvent) => void;
  onHeadOver: (e: DragEvent) => void;
  labels: { show: string; hide: string };
  children: ReactNode;
}) {
  const [stored, toggle] = useFold(foldId);
  const open = editing || stored;
  return (
    <div
      className="nav-sec-g"
      data-open={open ? '' : undefined}
      data-drop={dropMark}
      data-dragging={dragging ? '' : undefined}
      onDragOver={onDragOver}
    >
      <div className="nc-gh" onDragOver={onHeadOver}>
        {editing && editHead ? (
          editHead
        ) : (
          <button
            type="button"
            className="nav-sec nav-sec-t"
            aria-expanded={open}
            aria-label={`${open ? labels.hide : labels.show} · ${name}`}
            onClick={editing ? undefined : toggle}
          >
            <Icon name="chevron-down" width={13} height={13} className="nav-sec-chev" />
            <b>{name}</b>
          </button>
        )}
      </div>
      {open && children}
    </div>
  );
}
