import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Badge, LinkButton, PageHeader } from '@/components/ui';
import { Ring } from '@/components/ui/ring';
import { pageContext } from '@/lib/context';
import { inviteState, latestInvites } from '@/lib/invites';
import { listMembers } from '@/lib/members';
import { darkVariant } from '@/lib/palette';
import { fiscalYearBounds } from '@/lib/periods';
import { memberLedger } from '@/lib/stats';

/** The member's colour mixed into the tile, as service tiles do with theirs. */
function tint(colour: string) {
  const c = `light-dark(${colour}, ${darkVariant(colour)})`;
  return {
    background: `linear-gradient(160deg, color-mix(in srgb, ${c} 22%, var(--color-surface-solid)), color-mix(in srgb, ${c} 6%, var(--color-surface-solid)))`,
    borderColor: `color-mix(in srgb, ${c} 40%, transparent)`,
  };
}

const avatar = (colour: string) => ({
  background: `linear-gradient(135deg, light-dark(${colour}, ${darkVariant(colour)}), var(--color-accent))`,
});

export default async function MembersPage() {
  const { hh, me, date, today, money } = await pageContext();
  const t = await getTranslations('members');
  const members = listMembers(hh.id);
  const invites = latestInvites(hh.id);
  const admin = me.role === 'owner';
  const shared = hh.splitMode === 'shared';
  const fy = fiscalYearBounds(today, hh.fiscalYearStartMonth);

  return (
    <>
      <PageHeader
        title={t('title')}
        subtitle={shared ? t('subtitle', { fy: fy.label }) : t('singleNote')}
        action={admin ? <LinkButton href="/members/new">{t('add')}</LinkButton> : undefined}
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {members.map((m) => {
          const active = m.activeFrom <= today && (!m.activeTo || m.activeTo >= today);
          const canEdit = admin || me.id === m.id;
          const status = m.accountId
            ? 'joined'
            : inviteState(invites.get(m.id)) === 'pending'
              ? 'pending'
              : inviteState(invites.get(m.id)) === 'expired'
                ? 'expired'
                : 'none';
          const ledger = shared ? memberLedger(hh.id, m.id, today, hh.fiscalYearStartMonth) : null;
          const pct =
            ledger && ledger.totalThisFy > 0
              ? Math.round((ledger.paidThisFy / ledger.totalThisFy) * 100)
              : null;
          const body = (
            <>
              <div className="flex items-start justify-between gap-3">
                <span className="flex min-w-0 items-center gap-3">
                  <span
                    className="grid size-11 shrink-0 place-items-center rounded-full text-base font-bold text-white shadow-inner"
                    style={avatar(m.colour)}
                  >
                    {m.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="flex min-w-0 flex-col leading-tight">
                    <span className="truncate font-display text-base font-semibold">
                      {m.name}{' '}
                      {m.id === me.id && (
                        <span className="font-sans text-xs font-normal text-fg-muted">
                          ({t('you')})
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-fg-muted">
                      {t('since', { date: date(m.activeFrom, 'short') })}
                      {m.activeTo && ` · ${t('until', { date: date(m.activeTo, 'short') })}`}
                    </span>
                  </span>
                </span>
                <span className="flex flex-col items-end gap-1">
                  {m.role === 'owner' && <Badge tone="accent">{t('owner')}</Badge>}
                  {!active && <Badge>{t('inactive')}</Badge>}
                  {admin && status !== 'joined' && (
                    <Badge tone={status === 'pending' ? 'warning' : 'neutral'}>
                      {t(`status.${status}`)}
                    </Badge>
                  )}
                </span>
              </div>

              {ledger && (
                <div className="mt-4 flex items-center gap-4">
                  <Ring id={`member-${m.id}`} pct={pct ?? 0} size={84} stroke={9}>
                    <span className="font-display text-lg font-semibold tabular-nums">
                      {pct === null ? '—' : `${pct}%`}
                    </span>
                  </Ring>
                  <div className="flex min-w-0 flex-col gap-0.5 text-sm">
                    <span
                      className={`font-display text-2xl leading-none font-semibold tabular-nums ${ledger.owed > 0 ? '' : 'text-success'}`}
                    >
                      {ledger.owed > 0 ? money(ledger.owed) : t('tile.settled')}
                    </span>
                    <span className="text-xs text-fg-muted">
                      {ledger.owed > 0
                        ? t('tile.owes', { count: ledger.unpaid.length })
                        : t('tile.nothingOwed')}
                    </span>
                    {ledger.totalThisFy > 0 && (
                      <span className="text-xs text-fg-muted">
                        {t('tile.paidOf', {
                          paid: money(ledger.paidThisFy),
                          total: money(ledger.totalThisFy),
                        })}
                      </span>
                    )}
                    {ledger.owedToMe > 0 && (
                      <span className="text-xs">
                        {t('tile.owedToThem', { amount: money(ledger.owedToMe) })}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {shared && m.splitWeight !== 1 && (
                <p className="mt-3 text-xs text-fg-muted">
                  {t('weight', { weight: m.splitWeight })}
                </p>
              )}
            </>
          );
          const className = 'glass flex flex-col rounded-card p-5 text-fg';
          return canEdit ? (
            <Link
              key={m.id}
              href={`/members/${m.id}/edit`}
              className={`${className} lift`}
              style={tint(m.colour)}
            >
              {body}
            </Link>
          ) : (
            <div key={m.id} className={className} style={tint(m.colour)}>
              {body}
            </div>
          );
        })}
      </div>
    </>
  );
}
