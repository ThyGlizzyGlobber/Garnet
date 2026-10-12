import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Icon } from '@/components/app/icons';
import { AllowanceCard } from '@/components/app/allowance-card';
import { Button, LinkButton } from '@/components/ui';
import { InlineAction } from '@/components/ui/form';
import { StatusPill } from '@/components/ui/list-row';
import { HOUSEHOLD_TYPES } from '@/db/schema';
import { allowanceView } from '@/lib/allowance';
import { pageContext } from '@/lib/context';
import { addDays } from '@/lib/dates';
import { formatMoneyParts } from '@/lib/format';
import { homeData } from '@/lib/home-data';
import { typeIcon } from '@/lib/household-types';
import { latestRegionalChoice, regionalEnabled } from '@/lib/regional';
import { isAdmin } from '@/lib/roles';
import { weatherCodeKey } from '@/lib/weather-codes';
import { acknowledgeSharingAction, setHouseholdTypeAction } from './settings/actions';

/**
 * Home (SCOPE-redesign-2.md §4, confirmed by the owner's mum): one hero card
 * top-left with the month, its amount paid or left to pay, the month's bills
 * and a six-month bar chart whose bars open the month in Bills; Next due
 * beside it; This week and Coming up below. The date and a weather line sit
 * above. Every number comes from homeData(); the page only words and lays
 * them out. One-time notices sit above the first row.
 */
export default async function HomePage() {
  const { hh, me, today, money, month: monthName } = await pageContext();
  const t = await getTranslations('home.page');
  const tw = await getTranslations('weather');
  const tsh = await getTranslations('sharing');
  const tt = await getTranslations('householdTypes');
  const tp = await getTranslations('allowancePeriods');
  const tu = await getTranslations('ui');
  const allowance = allowanceView(hh, today);
  const data = homeData(hh, me, today);
  const sharingNotice =
    isAdmin(me) &&
    !hh.isDemo &&
    hh.shareRegional &&
    regionalEnabled() &&
    !latestRegionalChoice(hh.id);

  const dm = new Intl.DateTimeFormat(hh.locale, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
  const longDay = new Intl.DateTimeFormat(hh.locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
  const at = (iso: string) => new Date(`${iso}T00:00:00Z`);
  const shortDate = (iso: string) => dm.format(at(iso));
  const statusWord = (s: { key: string; days: number; dueDate: string }) =>
    tu(`status.${s.key}`, { n: Math.abs(s.days), date: shortDate(s.dueDate) });

  // The hero: what's paid this month and what's left, from the month's parts.
  const list = data.month.list;
  const paidMinor = list.filter((x) => x.paid).reduce((s, x) => s + x.amountMinor, 0);
  const leftMinor = list.filter((x) => !x.paid).reduce((s, x) => s + x.amountMinor, 0);
  const allPaid = list.length > 0 && leftMinor === 0;
  const hero = formatMoneyParts(leftMinor > 0 ? leftMinor : paidMinor, hh.currency, hh.locale);
  const heroLine = !list.length
    ? t('nothingThisMonth')
    : leftMinor > 0
      ? t('leftLine', { paid: money(paidMinor) })
      : t('paidLine', { left: money(leftMinor) });

  // The last six months, by what fell due in each (today's month last).
  const six = data.monthly.slice(-6);
  const max = Math.max(1, ...six.map((m) => m.totalMinor));

  // Next due: the first thing the viewer pays that isn't paid yet; then the next after it,
  // or the next bill expected to arrive.
  const first = data.upcoming[0] ?? null;
  const second = data.upcoming[1] ?? null;
  const nextUp = second
    ? {
        name: second.serviceName,
        line: statusWord(second.status),
        amount: money(second.amountMinor),
        href: `/bills/${second.billId}`,
        tone: second.status.key === 'overdue' ? ('bad' as const) : ('soon' as const),
      }
    : data.nextExpected
      ? {
          name: data.nextExpected.serviceName,
          line: t('upcoming'),
          amount: money(data.nextExpected.amountMinor),
          href: `/services/${data.nextExpected.serviceId}`,
          tone: 'soon' as const,
        }
      : null;

  // This week: the seven days from the week's start, today marked, a dot on days with something due.
  const dow = (at(today).getUTCDay() - hh.weekStartsOn + 7) % 7;
  const weekStart = addDays(today, -dow);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const dueDays = new Set(
    data.upcoming.filter((u) => u.days >= 0 && u.days <= 6).map((u) => u.dueDate),
  );
  const weekItems = data.upcoming.filter((u) => u.days >= 0 && u.days <= 6);
  const weekLetter = new Intl.DateTimeFormat(hh.locale, { weekday: 'narrow', timeZone: 'UTC' });
  const weekDay = new Intl.DateTimeFormat(hh.locale, { weekday: 'short', timeZone: 'UTC' });
  const rangeText = `${at(days[0]!).getUTCDate()} – ${dm.format(at(days[6]!))}`;

  // Coming up: the next months' expected totals, the first three.
  const ahead = data.forecast.slice(0, 3);
  const aheadMax = Math.max(1, ...data.forecast.map((m) => m.totalMinor));
  const whole = (minor: number) => money(minor, hh.currency, { whole: true });

  const wx = data.weather?.days.find((d) => d.date === today) ?? data.weather?.days[0];
  const weatherLine =
    wx && data.weather?.place && wx.hi !== null
      ? t('weather', {
          temp: Math.round(wx.hi),
          conditions: tw(`code.${weatherCodeKey(wx.code)}`),
          place: data.weather.place,
        })
      : null;

  return (
    <div className="scr hm">
      {allowance && (
        <AllowanceCard view={allowance} locale={hh.locale} periodWord={tp(hh.allowancePeriod)} />
      )}
      {isAdmin(me) && !hh.type && (
        <div className="rd-card rd-pad type-ask">
          <div className="min-w-0">
            <b>{tt('ask.title', { household: hh.name })}</b>{' '}
            <span className="text-fg-2">{tt('ask.body')}</span>
          </div>
          <div className="type-ask-acts">
            {HOUSEHOLD_TYPES.map((k) => (
              <form key={k} action={setHouseholdTypeAction}>
                <input type="hidden" name="type" value={k} />
                <Button type="submit" variant="secondary" size="sm" icon={typeIcon(k)}>
                  {tt(`${k}.name`)}
                </Button>
              </form>
            ))}
          </div>
        </div>
      )}
      {sharingNotice && (
        <div className="rd-card rd-pad flex flex-wrap items-center gap-3 text-sm">
          <span className="min-w-0 flex-1">
            <b>{tsh('notice.title')}</b> <span className="text-fg-2">{tsh('notice.body')}</span>
          </span>
          <InlineAction action={acknowledgeSharingAction} label={tsh('notice.ok')} />
          <LinkButton href="/settings/sharing" variant="secondary" size="sm">
            {tsh('notice.change')}
          </LinkButton>
          <Link href="/privacy" className="tlink">
            {tsh('privacy')}
          </Link>
        </div>
      )}

      {/* The date, and the weather in one line (SCOPE-redesign-2.md §4 Home 2). */}
      <div className="hm-top">
        <h1>{longDay.format(at(today))}</h1>
        {weatherLine && (
          <div className="hm-wx">
            <Icon name="sun" width={16} height={16} />
            <span>{weatherLine}</span>
          </div>
        )}
      </div>

      <div className="two-up">
        {/* The hero: the month, its figure, its bills, the last six months. */}
        <section className="rd-card hm-hero wide" aria-labelledby="hm-hero-t">
          <div className="hm-hero-l">
            <div className="hm-hero-h">
              <h2 id="hm-hero-t">{monthName(data.month.month, 'long')}</h2>
              {allPaid && <StatusPill tone="ok">{t('allPaid')}</StatusPill>}
            </div>
            <div>
              <div className="hero-num">
                {hero.main}
                {hero.minor && <span className="cents">{hero.minor}</span>}
                {hero.tail}
              </div>
              <p className="hm-hero-line">{heroLine}</p>
            </div>
            {list.length > 0 && (
              <ul className="hm-list">
                {list.map((x) => (
                  <li key={`${x.billId}-${x.instalment?.n ?? 0}`}>
                    <Link href={`/bills/${x.billId}`}>
                      <Icon
                        name={x.paid ? 'check' : 'clock'}
                        width={16}
                        height={16}
                        className={x.paid ? 'is-paid' : 'is-due'}
                        aria-label={x.paid ? t('paidMark') : t('dueMark')}
                        role="img"
                      />
                      {x.serviceName}
                      {x.instalment && (
                        <span className="muted">
                          {' '}
                          {x.instalment.n}/{x.instalment.of}
                        </span>
                      )}
                    </Link>
                    <span>{money(x.amountMinor)}</span>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/services" className="tlink">
              {t('allServices', { count: data.serviceCount })}
              <Icon name="arrow-right" width={16} height={16} />
            </Link>
          </div>
          {six.some((m) => m.totalMinor > 0) && (
            <figure className="hm-fig">
              <figcaption>
                <span>{t('lastSix')}</span>
                <span className="muted">{t('tapMonth')}</span>
              </figcaption>
              <div className="bars">
                {six.map((m) => {
                  const now = m.month === data.month.month;
                  const h = Math.max(3, Math.round((m.totalMinor / max) * 200));
                  return (
                    <Link
                      key={m.month}
                      href={`/bills?m=${m.month}`}
                      className={`bar${now ? ' on' : ''}`}
                      aria-current={now ? 'true' : undefined}
                      aria-label={t(now ? 'barLabelNow' : 'barLabel', {
                        month: monthName(m.month, 'long'),
                        amount: money(m.totalMinor),
                      })}
                    >
                      <span className="col">
                        <span className={`sol${now ? ' lit' : ''}`} style={{ height: h }} />
                      </span>
                      {monthName(m.month, 'short')}
                    </Link>
                  );
                })}
              </div>
            </figure>
          )}
        </section>

        {/* Next due. */}
        <section className="rd-card hm-next narrow" aria-labelledby="hm-next-t">
          <div className="h2row">
            <Icon name="clock" width={20} height={20} />
            <h2 id="hm-next-t">{t('nextDue')}</h2>
          </div>
          {first ? (
            <div>
              <Link href={`/bills/${first.billId}`} className="big-word hm-next-fig">
                {money(first.amountMinor)}
              </Link>
              <p className={`hm-next-line${first.status.key === 'overdue' ? ' bad' : ''}`}>
                {t('nextLine', { service: first.serviceName, status: statusWord(first.status) })}
              </p>
            </div>
          ) : (
            <p className="big-word">{t('nothingDue')}</p>
          )}
          {nextUp && (
            <div className="rule-top hm-nextup">
              <p className="lbl-sm">{t('nextUp')}</p>
              <Link href={nextUp.href} className={`hm-up ${nextUp.tone}`}>
                <span>
                  <span className="hm-up-n">{nextUp.name}</span>
                  <span className="hm-up-s">
                    <Icon name={nextUp.tone === 'bad' ? 'alert' : 'clock'} width={14} height={14} />
                    {nextUp.line}
                  </span>
                </span>
                <span className="hm-up-a">{nextUp.amount}</span>
              </Link>
            </div>
          )}
          <Link href="/bills" className="tlink push">
            {t('seeBills')}
            <Icon name="arrow-right" width={16} height={16} />
          </Link>
        </section>
      </div>

      <div className="two-up">
        {/* This week: the strip of days and one sentence. */}
        <section className="rd-card hm-week half" aria-labelledby="hm-week-t">
          <div className="hm-week-h">
            <div className="h2row">
              <Icon name="calendar" width={20} height={20} />
              <h2 id="hm-week-t">{t('thisWeek')}</h2>
            </div>
            <span className="muted">{rangeText}</span>
          </div>
          <div className="hm-days">
            {days.map((d) => {
              const now = d === today;
              return (
                <div key={d} className={now ? 'on' : undefined}>
                  <span>{weekLetter.format(at(d))}</span>
                  <span className="hm-day" aria-current={now ? 'date' : undefined}>
                    {at(d).getUTCDate()}
                  </span>
                  <i className={dueDays.has(d) ? 'due' : undefined} aria-hidden="true" />
                </div>
              );
            })}
          </div>
          <p className="hm-week-line">
            {weekItems.length === 0
              ? t('quiet')
              : t('weekLine', {
                  count: weekItems.length,
                  amount: money(weekItems.reduce((s, u) => s + u.amountMinor, 0)),
                })}
          </p>
          {weekItems.length > 0 && (
            <p className="hm-week-items">
              {weekItems
                .slice(0, 3)
                .map((u) =>
                  t('weekItem', { service: u.serviceName, day: weekDay.format(at(u.dueDate)) }),
                )
                .join(' · ')}
            </p>
          )}
        </section>

        {/* Coming up: the next months, one bar each (the whole six on Budget). */}
        {ahead.length > 0 && (
          <section className="rd-card hm-ahead half" aria-labelledby="hm-ahead-t">
            <div className="h2row">
              <Icon name="bars" width={20} height={20} />
              <h2 id="hm-ahead-t">{t('comingUp')}</h2>
            </div>
            <div className="hm-ahead-rows">
              {ahead.map((m, i) => (
                <div key={m.month} className="mrow">
                  <span>{monthName(m.month, 'long')}</span>
                  <span className="meter">
                    <i
                      className={i === 0 ? 'lead' : undefined}
                      style={{ width: `${Math.round((m.totalMinor / aheadMax) * 100)}%` }}
                    />
                  </span>
                  <span>{t('approx', { amount: whole(m.totalMinor) })}</span>
                </div>
              ))}
            </div>
            <Link href="/budget" className="tlink push">
              {t('allSix')}
              <Icon name="arrow-right" width={16} height={16} />
            </Link>
          </section>
        )}
      </div>
    </div>
  );
}
