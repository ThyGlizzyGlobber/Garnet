import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { Household, Member } from '@/db/schema';
import { ArrangeServices } from '@/components/app/arrange-services';
import { NavGroup } from '@/components/app/nav-group';
import { formatMoney } from '@/lib/format';
import { colourCss } from '@/lib/palette';
import { shellView, type ShellEntry, type ShellView } from '@/lib/shell';

/**
 * The Services page's Arrange card (SCOPE-header.md H-D3): the household's
 * groups and My Services as the lines the side menu used to draw (a colour
 * dot, the name, this month's figure; a main service with its parts under an
 * arrow), dragged into groups and order. The numbers come from shellView().
 */
export async function ServicesArrange({
  hh,
  me,
  today,
}: {
  hh: Household;
  me: Member;
  today: string;
}) {
  const view = shellView(hh, me, today);
  const t = await getTranslations('nav');
  const ts = await getTranslations('services');
  const tmain = await getTranslations('main');
  const money = (minor: number) => formatMoney(minor, view.currency, hh.locale, { whole: true });
  const line = (s: { name: string; minor: number }) => (
    <>
      <i aria-hidden="true" />
      <span>{s.name}</span>
      {/* Nothing due on it this month: a dash, not a zero. */}
      <b>{s.minor ? money(s.minor) : '—'}</b>
    </>
  );
  const nameOf = (s: ShellEntry) =>
    s.kind === 'group' && s.category ? tmain(`main.${s.category}`) : s.name;
  const row = (s: ShellEntry) =>
    s.kind === 'group' ? (
      <NavGroup
        key={s.key}
        href={s.href}
        groupKey={s.key}
        arrange={view.me.admin || s.key.startsWith('m')}
        label={nameOf(s)}
        showLabel={t('showSubs')}
        hideLabel={t('hideSubs')}
        colour={colourCss(s.colour)}
        row={line({ ...s, name: nameOf(s) })}
        items={s.children.map((c) => ({
          id: c.id,
          href: c.href,
          node: (
            <Link
              href={c.href}
              draggable={false}
              className="nc-s nc-sub"
              style={{ ['--svc' as string]: colourCss(c.colour) }}
            >
              {line(c)}
            </Link>
          ),
        }))}
      />
    ) : (
      <Link
        key={s.id}
        href={s.href}
        draggable={false}
        className="nc-s"
        style={{ ['--svc' as string]: colourCss(s.colour) }}
      >
        {line(s)}
      </Link>
    );
  const asSections = (secs: ShellView['sections']) =>
    secs.map((sec) => ({
      id: sec.group?.id ?? null,
      name: sec.group?.name ?? '',
      keys: sec.entries.map((e) => e.key),
    }));
  return (
    <ArrangeServices
      sections={asSections(view.sections)}
      mine={asSections(view.mine)}
      rows={[...view.sections, ...view.mine]
        .flatMap((sec) => sec.entries)
        .map((e) => ({ key: e.key, node: row(e) }))}
      lines={view.lines}
      admin={view.me.admin}
      labels={{
        open: ts('arrange'),
        close: ts('arrangeDone'),
        head: t('servicesHead'),
        thisMonth: t('thisMonth'),
        other: t('otherServices'),
        mine: t('myServices'),
      }}
    />
  );
}
