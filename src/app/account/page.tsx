import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { joinWithCodeAction } from '@/app/welcome/actions';
import { JoinCodeForm } from '@/components/app/auth-forms';
import { Icon } from '@/components/app/icons';
import { PageTitle } from '@/components/ui/blocks';
import { Avatars } from '@/components/ui/colour';
import { StatusPill } from '@/components/ui/list-row';
import { MoreMenu } from '@/components/ui/more-menu';
import { accountView, type HouseholdTile } from '@/lib/account';
import { authState, pathFor } from '@/lib/auth/session';
import { formatMoney, formatMoneyParts } from '@/lib/format';
import { roleKey, typeIcon } from '@/lib/household-types';
import { leaveHouseholdAction, makePrimaryAction, switchHouseholdAction } from './actions';

export const dynamic = 'force-dynamic';

/**
 * Your households (SCOPE-redesign-2.md §4): a hero with what you owe across
 * every household, this month's bills due in all of them and two pills
 * (nothing overdue, nothing to confirm, or how many); one list of households,
 * each a row with its role, a quiet Primary tag, who lives there, this
 * month's figure and what you owe, and a More options menu holding Leave and
 * Make primary; Start and Join side by side; and the bills coming up across
 * every household. Numbers from accountView().
 */
export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ left?: string; blocked?: string; hh?: string }>;
}) {
  const { left, blocked, hh: blockedName } = await searchParams;
  const state = await authState();
  if (state.kind !== 'ok' && state.kind !== 'no-household') redirect(pathFor(state)!);
  const me = state.kind === 'ok' ? state.member : null;
  const demo = state.kind === 'ok' && state.demo;
  const view = accountView(state.account ?? null, me);
  const t = await getTranslations('account');
  const tr = await getTranslations('account.rd');
  const troles = await getTranslations('roles');
  const money = (minor: number, currency: string, locale: string) =>
    formatMoney(minor, currency, locale);
  const locale = view.tiles[0]?.locale ?? 'en-AU';
  const dm = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' });
  const owe = view.oweAll;
  const oweParts = owe ? formatMoneyParts(owe.minor, owe.currency, owe.locale) : null;
  const upcoming = view.recent.filter((b) => b.status !== 'paid');

  const row = (h: HouseholdTile) => {
    const items = [];
    if (!h.primary && !demo)
      items.push({
        label: tr('makePrimary'),
        icon: 'home',
        action: makePrimaryAction,
        hidden: { memberId: h.memberId },
      });
    if (!demo)
      items.push({
        label: tr('leave'),
        icon: 'logout',
        action: leaveHouseholdAction,
        hidden: { memberId: h.memberId },
        confirm: t('leave.confirm', { household: h.name }),
        tone: 'bad' as const,
      });
    return (
      <div key={h.memberId} className="hrow">
        <span className="lr-ico" aria-hidden="true">
          <Icon name={typeIcon(h.type)} width={24} height={24} />
        </span>
        <span className="hrow-main">
          <span className="hrow-name">
            <form action={switchHouseholdAction} className="contents">
              <input type="hidden" name="memberId" value={h.memberId} />
              <button
                type="submit"
                className="hrow-link"
                aria-label={t('tile.open', { household: h.name })}
              >
                {h.name}
              </button>
            </form>
            <span className="tag">{troles(roleKey(h.role, h.type))}</span>
            {h.primary && <span className="tag q">{tr('primary')}</span>}
          </span>
          <span className="hrow-people">
            <Avatars members={h.people} size="sm" />
            <span className="lr-sub">{tr('members', { count: h.people.length })}</span>
          </span>
        </span>
        <span className="lr-end">
          <span className={`a${h.monthMinor ? '' : ' dim'}`}>
            {money(h.monthMinor, h.currency, h.locale)}
          </span>
          <span className="l">{tr('thisMonth')}</span>
        </span>
        <span className="lr-end">
          <span className={`a${h.oweMinor ? '' : ' dim'}`}>
            {money(h.oweMinor, h.currency, h.locale)}
          </span>
          <span className="l">{tr('youOweShort')}</span>
        </span>
        <MoreMenu label={tr('more', { household: h.name })} items={items} />
      </div>
    );
  };

  return (
    <div className="scr account">
      <PageTitle title={tr('title')} lede={tr('lede', { count: view.tiles.length })} />
      {left && (
        <p className="rd-note">
          <Icon name="check" width={16} height={16} />
          {t('leave.done')}
        </p>
      )}
      {blocked && blockedName && (
        <p className="rd-note bad">
          <Icon name="alert" width={16} height={16} />
          {t(`leave.blocked.${blocked}`, { household: blockedName })}
        </p>
      )}

      {view.tiles.length > 0 && (
        <section className="rd-card rd-pad ac-hero" aria-label={tr('youOwe')}>
          <div>
            <p className="lbl ac-hero-l">{tr('youOwe')}</p>
            <div className="hero-num md">
              {oweParts ? (
                <>
                  {oweParts.main}
                  {oweParts.minor && <span className="cents">{oweParts.minor}</span>}
                  {oweParts.tail}
                </>
              ) : (
                '—'
              )}
            </div>
            <p className="ac-hero-line">
              {!owe ? tr('mixed') : owe.minor > 0 ? tr('oweLine') : tr('nothingOwed')}
            </p>
          </div>
          <div className="ac-hero-r">
            <div>
              <p className="lbl-sm">{tr('dueAll')}</p>
              <p className="sum-num">
                {view.monthAll
                  ? money(view.monthAll.minor, view.monthAll.currency, view.monthAll.locale)
                  : '—'}
              </p>
            </div>
            <div className="ac-hero-pills">
              {view.overdueAll === 0 ? (
                <StatusPill tone="ok">{tr('nothingOverdue')}</StatusPill>
              ) : (
                <StatusPill tone="bad">{tr('overdue', { count: view.overdueAll })}</StatusPill>
              )}
              {view.waitingAll === 0 ? (
                <StatusPill tone="ok">{tr('nothingToConfirm')}</StatusPill>
              ) : (
                <Link href="/inbox?f=confirm" className="spill soon">
                  <Icon name="clock" width={14} height={14} />
                  <span>{tr('toConfirm', { count: view.waitingAll })}</span>
                </Link>
              )}
            </div>
          </div>
        </section>
      )}

      {view.tiles.length > 0 && (
        <section className="rd-card" aria-labelledby="ac-hh">
          <div className="ghead">
            <h2 id="ac-hh" className="lbl">
              {tr('households')}
            </h2>
          </div>
          {view.tiles.map(row)}
        </section>
      )}

      {!demo && (
        <div className="two-up">
          <section className="rd-card ac-opt half" aria-labelledby="ac-start">
            <span className="lr-ico" aria-hidden="true">
              <Icon name="plus" width={22} height={22} />
            </span>
            <div>
              <b id="ac-start">{tr('start')}</b>
              <p>{tr('startBody')}</p>
            </div>
            <Link href="/setup" className="btn btn-glass ac-opt-act">
              {tr('start')}
            </Link>
          </section>
          <section className="rd-card ac-opt half" aria-labelledby="ac-join" id="join">
            <span className="lr-ico" aria-hidden="true">
              <Icon name="link" width={22} height={22} />
            </span>
            <div>
              <b id="ac-join">{tr('join')}</b>
              <p>{tr('joinBody')}</p>
            </div>
            <div className="ac-opt-act ac-join">
              <JoinCodeForm action={joinWithCodeAction} />
            </div>
          </section>
        </div>
      )}

      {upcoming.length > 0 && (
        <section className="rd-card" aria-labelledby="ac-up">
          <div className="ghead">
            <h2 id="ac-up" className="lbl">
              {tr('comingUp')}
            </h2>
            <Link href="/bills" className="tlink">
              {tr('allBills')}
              <Icon name="arrow-right" width={16} height={16} />
            </Link>
          </div>
          {upcoming.map((b) => (
            <div key={`${b.memberId}-${b.id}`} className="crow">
              <span className="min-w-0">
                <span className="crow-name">{b.service}</span>
                <span className="lr-sub">
                  {[b.provider, b.household].filter(Boolean).join(' · ')}
                </span>
              </span>
              <span className="crow-st">
                <StatusPill tone={b.days < 0 ? 'bad' : 'soon'}>
                  {b.days < 0
                    ? tr('overdueBy', { count: -b.days })
                    : tr('dueIn', {
                        date: dm.format(new Date(`${b.dueDate}T00:00:00`)),
                        when: tr('inDays', { count: b.days }),
                      })}
                </StatusPill>
              </span>
              <span className="crow-amt">{money(b.amountMinor, b.currency, b.locale)}</span>
            </div>
          ))}
          <div className="msec-end" />
        </section>
      )}
    </div>
  );
}
