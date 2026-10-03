import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { joinWithCodeAction } from '@/app/welcome/actions';
import { JoinCodeForm } from '@/components/app/auth-forms';
import { Icon } from '@/components/app/icons';
import { PageTitle, SectionHead } from '@/components/ui/blocks';
import { Chip } from '@/components/ui/chip';
import { Avatars } from '@/components/ui/colour';
import { accountView, type HouseholdTile } from '@/lib/account';
import { roleKey, typeIcon } from '@/lib/household-types';
import { authState, pathFor } from '@/lib/auth/session';
import { formatMoney } from '@/lib/format';
import { LeaveButton } from './leave-button';
import { makePrimaryAction, switchHouseholdAction } from './actions';

export const dynamic = 'force-dynamic';

/**
 * The Account Dashboard (SCOPE-accounts.md §3): every household this person
 * belongs to as a tile leading with what they owe there, Start and Join
 * tiles, and the Account card (name, email, sign-in, PIN, light/dark,
 * sign out). Numbers from accountView().
 */
export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ left?: string }>;
}) {
  const { left } = await searchParams;
  const state = await authState();
  if (state.kind !== 'ok' && state.kind !== 'no-household') redirect(pathFor(state)!);
  const me = state.kind === 'ok' ? state.member : null;
  const demo = state.kind === 'ok' && state.demo;
  const view = accountView(state.account ?? null, me);
  const t = await getTranslations('account');
  const tr = await getTranslations('roles');
  const money = (minor: number, currency: string, locale: string) =>
    formatMoney(minor, currency, locale, { whole: true });
  const owe = view.oweAll;
  const lede = !view.tiles.length
    ? t('ledeNone')
    : owe && owe.minor > 0
      ? t('ledeOwe', { amount: money(owe.minor, owe.currency, owe.locale) })
      : t('ledeClear');

  return (
    <div className="scr account">
      <PageTitle
        title={view.name ? t('title', { name: view.name }) : t('titleNoName')}
        lede={lede}
      />
      {left && <p className="notice">{t('leave.done')}</p>}
      <section className="acct-section">
        <SectionHead title={t('households')} />
        <div className="hh-grid">
          {view.tiles.map((h) => (
            <Tile key={h.memberId} h={h} demo={demo} money={money} t={t} tr={tr} />
          ))}
          {!demo && (
            <>
              <Link href="/setup" className="hh-tile hh-add rounded-card">
                <span className="hh-add-ic">
                  <Icon name="plus" width={22} height={22} />
                </span>
                <b>{t('start')}</b>
                <span className="muted small">{t('startSub')}</span>
              </Link>
              <div id="join" className="hh-tile hh-add rounded-card">
                <span className="hh-add-ic">
                  <Icon name="link" width={22} height={22} />
                </span>
                <b>{t('join')}</b>
                <span className="muted small">{t('joinSub')}</span>
                <JoinCodeForm action={joinWithCodeAction} />
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function Tile({
  h,
  demo,
  money,
  t,
  tr,
}: {
  h: HouseholdTile;
  demo: boolean;
  money: (minor: number, currency: string, locale: string) => string;
  t: Awaited<ReturnType<typeof getTranslations<'account'>>>;
  tr: Awaited<ReturnType<typeof getTranslations<'roles'>>>;
}) {
  const dots = [
    h.overdue > 0 && t('tile.overdue', { count: h.overdue }),
    h.waiting > 0 && t('tile.waiting', { count: h.waiting }),
  ].filter(Boolean) as string[];
  return (
    <article className={`hh-tile glass rounded-card${h.current ? ' on' : ''}`}>
      <form action={switchHouseholdAction} className="hh-open">
        <input type="hidden" name="memberId" value={h.memberId} />
        <button
          type="submit"
          className="hh-main"
          aria-label={t('tile.open', { household: h.name })}
        >
          <span className="hh-head">
            <span className="hh-name">
              <span className="hh-ic">
                <Icon name={typeIcon(h.type)} width={15} height={15} />
              </span>
              {h.primary && (
                <i className="hh-prim" title={t('tile.primary')}>
                  <Icon name="home" width={12} height={12} />
                </i>
              )}
              <b>{h.name}</b>
            </span>
            <Chip tone="neutral">{tr(roleKey(h.role, h.type))}</Chip>
          </span>
          <span className="hh-fig">
            {h.split && h.oweMinor > 0 ? (
              <>
                <b>{money(h.oweMinor, h.currency, h.locale)}</b>
                <span className="muted small">{t('tile.youOwe')}</span>
              </>
            ) : (
              <>
                <b className="hh-ok">
                  <Icon name="check" width={18} height={18} />
                  {t('tile.allPaid')}
                </b>
                <span className="muted small">{t('tile.nothingOwed')}</span>
              </>
            )}
          </span>
          <span className="hh-foot">
            <span className="muted small">
              {t('tile.month', { amount: money(h.monthMinor, h.currency, h.locale) })}
            </span>
            {dots.length > 0 && (
              <span className="hh-dots">
                <i className="sw-dot" aria-hidden="true" />
                {dots.join(' · ')}
              </span>
            )}
          </span>
        </button>
      </form>
      <div className="hh-bottom">
        <Avatars members={h.people} size="sm" />
        <span className="hh-acts">
          {!h.primary && !demo && (
            <form action={makePrimaryAction}>
              <input type="hidden" name="memberId" value={h.memberId} />
              <button type="submit" className="link small">
                {t('tile.makePrimary')}
              </button>
            </form>
          )}
          {!demo && (
            <LeaveButton
              memberId={h.memberId}
              label={t('tile.leave')}
              confirm={t('leave.confirm', { household: h.name })}
            />
          )}
        </span>
      </div>
    </article>
  );
}
