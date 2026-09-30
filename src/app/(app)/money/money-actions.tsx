'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui';
import { Avatar, Disc } from '@/components/ui/colour';
import { Segmented } from '@/components/ui/controls';
import { Sheet, SheetActions } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { formatMoney } from '@/lib/format';
import { recordPaymentAction, remindEveryoneAction } from './actions';

/** A share someone owes the viewer, ready for the Record-a-payment sheet. */
export interface OwedShare {
  shareId: string;
  fromId: string;
  serviceName: string;
  icon: string;
  colour: string;
  amountMinor: number;
  currency: string;
  /** "Jun – Aug · due 12 Oct" */
  sub: string;
  instalment: number | null;
}

/**
 * Money's two buttons (D9). Remind everyone emails the housemates who owe
 * the viewer, at most once a day each, and says so in a toast. Record a
 * payment opens a sheet: who paid, which shares, how and when.
 */
export function MoneyActions({
  people,
  owed,
  today,
  locale,
  canRemind,
}: {
  people: { id: string; name: string; colour: string }[];
  owed: OwedShare[];
  today: string;
  locale: string;
  canRemind: boolean;
}) {
  const t = useTranslations('money');
  const toast = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(
    () => people.find((p) => owed.some((o) => o.fromId === p.id))?.id ?? people[0]?.id ?? '',
  );
  const [method, setMethod] = useState('transfer');
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(owed.map((o) => o.shareId)));
  const [pending, start] = useTransition();
  const list = useMemo(() => owed.filter((o) => o.fromId === from), [owed, from]);
  const total = list.filter((o) => chosen.has(o.shareId)).reduce((s, o) => s + o.amountMinor, 0);
  const currency = list[0]?.currency ?? owed[0]?.currency ?? 'AUD';
  const money = (minor: number) => formatMoney(minor, currency, locale);
  const names = (xs: string[]) => new Intl.ListFormat(locale, { type: 'conjunction' }).format(xs);
  const fromPerson = people.find((p) => p.id === from);

  const remind = () =>
    start(async () => {
      const r = await remindEveryoneAction();
      if (r.sent.length) toast(t('remind.sent', { names: names(r.sent) }));
      else if (r.already.length) toast(t('remind.already', { names: names(r.already) }));
      else if (r.unreachable.length)
        toast(t('remind.unreachable', { names: names(r.unreachable) }));
      else toast(t('remind.nobody'));
    });

  const submit = (fd: FormData) =>
    start(async () => {
      const r = await recordPaymentAction(fd);
      setOpen(false);
      if (r.ok) toast(t('record.done', { name: r.from, amount: money(r.totalMinor) }));
      else toast(t('record.nothing'));
      router.refresh();
    });

  return (
    <div className="mh-acts">
      {canRemind && (
        <Button variant="secondary" icon="bell" onClick={remind} disabled={pending}>
          {t('remind.button')}
        </Button>
      )}
      <Button icon="plus" onClick={() => setOpen(true)} disabled={people.length === 0}>
        {t('record.button')}
      </Button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        eyebrow={t('title')}
        title={t('record.title')}
      >
        <form action={submit} className="grid gap-4">
          <div className="fld-row">
            <label className="fld">
              <span className="fld-l">{t('record.who')}</span>
              <span className="inp">
                {fromPerson && (
                  <Avatar name={fromPerson.name} colour={fromPerson.colour} size="sm" />
                )}
                <select
                  name="from"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  aria-label={t('record.who')}
                >
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </span>
            </label>
            <div className="fld">
              <span className="fld-l">{t('record.paid')}</span>
              <span className="inp">
                <span>{t('record.you')}</span>
              </span>
            </div>
          </div>
          <div className="fld">
            <span className="fld-l">{t('record.for')}</span>
            <div className="pay-list">
              {list.length === 0 ? (
                <p className="muted small">
                  {t('record.owesNothing', { name: fromPerson?.name ?? '' })}
                </p>
              ) : (
                list.map((o) => (
                  <label key={o.shareId} className="pay-item">
                    <input
                      type="checkbox"
                      name="share"
                      value={o.shareId}
                      checked={chosen.has(o.shareId)}
                      onChange={(e) => {
                        const next = new Set(chosen);
                        if (e.target.checked) next.add(o.shareId);
                        else next.delete(o.shareId);
                        setChosen(next);
                      }}
                    />
                    <Disc icon={o.icon} colour={o.colour} size="sm" />
                    <span>
                      <b>
                        {o.serviceName}
                        {o.instalment ? ` · ${t('record.instalment', { n: o.instalment })}` : ''}
                      </b>
                      <span className="muted small">{o.sub}</span>
                    </span>
                    <b>{formatMoney(o.amountMinor, o.currency, locale)}</b>
                  </label>
                ))
              )}
            </div>
          </div>
          <div className="fld-row">
            <div className="fld">
              <span className="fld-l">{t('record.how')}</span>
              <Segmented
                small
                value={method}
                onChange={setMethod}
                label={t('record.how')}
                items={[
                  { value: 'transfer', label: t('record.methods.transfer') },
                  { value: 'cash', label: t('record.methods.cash') },
                  { value: 'other', label: t('record.methods.other') },
                ]}
              />
              <input type="hidden" name="method" value={method} />
            </div>
            <label className="fld">
              <span className="fld-l">{t('record.when')}</span>
              <span className="inp">
                <input
                  type="date"
                  name="day"
                  defaultValue={today}
                  max={today}
                  aria-label={t('record.when')}
                />
              </span>
            </label>
          </div>
          <SheetActions>
            <Button type="submit" icon="check" disabled={pending || total === 0}>
              {t('record.submit', { amount: money(total) })}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {t('record.cancel')}
            </Button>
          </SheetActions>
          <p className="muted small">{t('record.note')}</p>
        </form>
      </Sheet>
    </div>
  );
}
