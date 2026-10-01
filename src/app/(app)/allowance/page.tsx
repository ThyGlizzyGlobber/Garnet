import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { AllowanceCard } from '@/components/app/allowance-card';
import { Icon } from '@/components/app/icons';
import { Card, LinkButton } from '@/components/ui';
import { Kv, PageTitle, SectionHead } from '@/components/ui/blocks';
import { Avatar, Disc } from '@/components/ui/colour';
import { CopyButton } from '@/components/ui/copy';
import { Rows } from '@/components/ui/rows';
import { allowanceView } from '@/lib/allowance';
import { pageContext } from '@/lib/context';
import { colourCss } from '@/lib/palette';
import { isAdmin } from '@/lib/roles';

/**
 * The utilities allowance in full (SCOPE-accounts.md D17): the card, what
 * counts this period, who owes what (the landlord also gets a message ready
 * to send), and earlier periods. Tenants see the running total and the
 * overage once there is one.
 */
export default async function AllowancePage() {
  const { hh, me, today, money, date } = await pageContext();
  const view = allowanceView(hh, today);
  if (!view) notFound();
  const t = await getTranslations('allowance');
  const tp = await getTranslations('allowancePeriods');
  const periodWord = tp(hh.allowancePeriod);
  const admin = isAdmin(me);
  const each = view.owed[0]?.minor ?? 0;
  const message = t('messageText', {
    label: view.label,
    used: money(view.usedMinor),
    over: money(view.overMinor),
    cap: money(view.capMinor),
    each: money(each),
  });
  return (
    <div className="scr">
      <PageTitle
        title={t('title')}
        lede={t('lede', { cap: money(view.capMinor), period: periodWord })}
        right={
          admin ? (
            <LinkButton href="/bills/new" variant="secondary" size="sm" icon="pencil">
              {t('logExpense')}
            </LinkButton>
          ) : undefined
        }
      />
      <AllowanceCard view={view} locale={hh.locale} periodWord={periodWord} link={false} />
      <div className="alw-grid">
        <Card>
          <SectionHead title={t('bills', { period: periodWord })} />
          {view.lines.length === 0 ? (
            <p className="muted">{t('nothing', { period: periodWord })}</p>
          ) : (
            <Rows>
              {view.lines.map((l) => (
                <Link
                  key={`${l.billId}-${l.instalment ?? 0}`}
                  href={`/bills/${l.billId}`}
                  className="bill-row"
                  style={{ ['--svc' as string]: colourCss(l.colour) }}
                >
                  <Disc icon={l.icon} colour={colourCss(l.colour)} size="sm" />
                  <span className="br-main">
                    <span className="br-title">{l.serviceName}</span>
                    <span className="br-sub">
                      {date(l.dueDate)}
                      {l.byHand && ` · ${t('byHand')}`}
                    </span>
                  </span>
                  <span className="br-end">
                    <span className="br-amt">{money(l.amountMinor)}</span>
                  </span>
                </Link>
              ))}
            </Rows>
          )}
        </Card>
        <div className="grid gap-4">
          <Card>
            <SectionHead title={t('owed')} />
            {view.overMinor > 0 ? (
              <>
                <p className="muted small">{t('owedBody')}</p>
                <div className="alw-owed">
                  {view.owed.map((o) => (
                    <div key={o.memberId} className="alw-owed-row">
                      <Avatar name={o.name} colour={o.colour} size="sm" />
                      <span>{o.name}</span>
                      <b>{money(o.minor)}</b>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="muted">
                <Icon name="check" width={14} height={14} /> {t('nobodyOwes')}
              </p>
            )}
          </Card>
          {admin && view.overMinor > 0 && (
            <Card>
              <SectionHead
                title={t('message')}
                right={<CopyButton value={message} label={t('copy')} />}
              />
              <p className="muted small">{t('messageBody')}</p>
              <div className="alw-msg">{message}</div>
            </Card>
          )}
          {view.history.length > 0 && (
            <Card>
              <SectionHead title={t('history')} />
              <Kv
                rows={view.history.map(
                  (h) =>
                    [
                      h.label,
                      h.overMinor > 0
                        ? t('historyLine', { used: money(h.usedMinor), over: money(h.overMinor) })
                        : t('historyWithin', { used: money(h.usedMinor) }),
                    ] as [string, string],
                )}
              />
            </Card>
          )}
          {!admin && <p className="muted small">{t('tenantsSee')}</p>}
        </div>
      </div>
    </div>
  );
}
