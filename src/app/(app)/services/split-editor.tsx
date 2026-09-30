'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Icon } from '@/components/app/icons';
import { PayerPick } from '@/components/app/pieces-client';
import { Avatar } from '@/components/ui/colour';
import { cx } from '@/components/ui/cx';
import { formatMoney, parseMoneyToMinor } from '@/lib/format';
import { computeShares, splitProblem } from '@/lib/splits';

export interface SplitMemberOption {
  id: string;
  name: string;
  colour: string;
  splitWeight: number;
  /** "Moved in 1 Aug", when they arrived this year. */
  note?: string;
}

export interface SplitEditorProps {
  members: SplitMemberOption[];
  modes: readonly string[];
  initialMode: string;
  /** Stored percentages (or old ratios) and amounts (major units, as typed). */
  percents: Record<string, number>;
  amounts: Record<string, string>;
  currency: string;
  locale: string;
  /** The latest bill's amount, for the "on the latest bill" preview. */
  latestMinor: number | null;
  /** Earlier bills a new split can still apply to (nobody has paid a share). */
  resplitCount: number;
  payerMemberId: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Everyone's even percentage, the last person taking the rounding (33.33 · 33.33 · 33.34). */
function evenPercents(ids: string[]): Record<string, string> {
  const each = round2(100 / Math.max(ids.length, 1));
  return Object.fromEntries(
    ids.map((id, i) => [id, String(i === ids.length - 1 ? round2(100 - each * i) : each)]),
  );
}

/**
 * Who pays the provider and how a household service is split, for admins:
 * evenly, by percentage (they must add up to 100%), or set amounts per bill
 * (anyone left blank shares what's left evenly). One row per person, with
 * what each would pay of the latest bill.
 */
export function SplitEditor(p: SplitEditorProps) {
  const t = useTranslations('services.split');
  const tf = useTranslations('services.form');
  const ids = p.members.map((m) => m.id);
  const [mode, setMode] = useState(p.initialMode);
  const [payer, setPayer] = useState(p.payerMemberId);
  const stored = Object.values(p.percents).reduce((s, v) => s + v, 0);
  const [percents, setPercents] = useState<Record<string, string>>(() =>
    stored > 0
      ? Object.fromEntries(
          ids.map((id) => [id, String(round2(((p.percents[id] ?? 0) * 100) / stored))]),
        )
      : evenPercents(ids),
  );
  const [amounts, setAmounts] = useState<Record<string, string>>(p.amounts);
  const [resplit, setResplit] = useState(true);
  const money = (minor: number) => formatMoney(minor, p.currency, p.locale);
  const sign =
    new Intl.NumberFormat(p.locale, { style: 'currency', currency: p.currency })
      .formatToParts(0)
      .find((x) => x.type === 'currency')?.value ?? p.currency;

  // Only the modes worth offering: weighted only while a service still uses it.
  const modes = p.modes.filter(
    (m) => m === 'equal' || m === 'percent' || m === 'fixed' || m === p.initialMode,
  );

  const pctTotal = round2(ids.reduce((s, id) => s + (Number(percents[id]) || 0), 0));
  const pctOk = !splitProblem('percent', {
    percents: Object.fromEntries(ids.map((id) => [id, Number(percents[id]) || 0])),
  });
  const fixed = Object.fromEntries(
    ids.flatMap((id) => {
      const v = amounts[id]?.trim();
      if (!v) return [];
      const minor = parseMoneyToMinor(v, p.currency);
      return minor === null || minor < 0 ? [] : [[id, minor]];
    }),
  ) as Record<string, number>;
  const setTotal = Object.values(fixed).reduce((s, v) => s + v, 0);
  const blanks = p.members.filter((m) => fixed[m.id] === undefined);

  // What each would pay of the latest bill (everyone living there for all of it).
  const example = p.latestMinor ?? 0;
  const preview =
    example > 0 && (mode !== 'percent' || pctOk)
      ? computeShares({
          amountMinor: example,
          periodStart: '2026-01-01',
          periodEnd: '2026-01-30',
          splitMode: mode as 'equal',
          members: p.members.map((m) => ({
            id: m.id,
            splitWeight: m.splitWeight,
            activeFrom: '2000-01-01',
            activeTo: null,
          })),
          customWeights: Object.fromEntries(ids.map((id) => [id, Number(percents[id]) || 0])),
          fixedAmounts: fixed,
          payerMemberId: payer || null,
        })
      : [];
  const part = (id: string) => preview.find((s) => s.memberId === id)?.amountMinor;

  return (
    <div className="split-ed">
      <div className="fld">
        <span className="fld-l">{tf('payer')}</span>
        <PayerPick
          name="payerMemberId"
          people={p.members}
          value={payer}
          onChange={setPayer}
          none={tf('noPayer')}
        />
        <span className="fld-h">{tf('payerHint')}</span>
      </div>
      <div className="fld">
        <span className="fld-l">{tf('splitMode')}</span>
        <div className="seg seg-sm" role="radiogroup" aria-label={t('how')}>
          {modes.map((m) => (
            <label key={m} className="seg-b" aria-pressed={mode === m}>
              <input
                type="radio"
                name="splitMode"
                value={m}
                checked={mode === m}
                onChange={() => setMode(m)}
              />
              <span>{t(`modes.${m}`)}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="se-list">
        {p.members.map((m) => (
          <div key={m.id} className="se-row">
            <Avatar name={m.name} colour={m.colour} />
            <span className="se-n">
              <b>{m.name}</b>
              {m.note && <span className="muted small">{m.note}</span>}
            </span>
            {mode === 'percent' || mode === 'fixed' ? (
              <span className="inp narrow">
                {mode === 'fixed' && <i className="inp-a">{sign}</i>}
                <input
                  name={mode === 'percent' ? `pct_${m.id}` : `amt_${m.id}`}
                  inputMode="decimal"
                  autoComplete="off"
                  value={mode === 'percent' ? (percents[m.id] ?? '') : (amounts[m.id] ?? '')}
                  placeholder={mode === 'percent' ? '0' : t('restPlaceholder')}
                  aria-label={m.name}
                  onChange={(e) =>
                    mode === 'percent'
                      ? setPercents({ ...percents, [m.id]: e.target.value })
                      : setAmounts({ ...amounts, [m.id]: e.target.value })
                  }
                />
                {mode === 'percent' && <i className="inp-a">%</i>}
              </span>
            ) : (
              <span className="muted small">
                {mode === 'weighted'
                  ? t('parts.weight', { value: m.splitWeight })
                  : t('parts.even')}
              </span>
            )}
            <span className="se-part">{part(m.id) !== undefined ? money(part(m.id)!) : ''}</span>
          </div>
        ))}
      </div>
      {mode === 'percent' && (
        <div className={cx('se-total', pctOk ? 'ok' : 'warn')}>
          <Icon name={pctOk ? 'check' : 'alert'} width={14} height={14} />
          {pctOk ? t('pctTotal', { total: pctTotal }) : t('pctOff', { total: pctTotal })}
          {' · '}
          <button
            type="button"
            className="link small"
            onClick={() => setPercents(evenPercents(ids))}
          >
            {t('evenly')}
          </button>
        </div>
      )}
      <p className="muted small">
        {mode === 'fixed'
          ? blanks.length
            ? t('fixedRest', {
                total: money(setTotal),
                names: blanks.map((m) => m.name).join(', '),
                count: blanks.length,
              })
            : t('fixedAll', { total: money(setTotal) })
          : t(`hints.${mode}`)}
        {mode === 'percent' && ` ${t('newMembers')}`}
        {example > 0 && ` ${t('preview', { amount: money(example) })}.`}
      </p>
      {p.resplitCount > 0 && (
        <label className="check">
          <input
            type="checkbox"
            name="resplit"
            checked={resplit}
            onChange={(e) => setResplit(e.target.checked)}
          />
          <span>
            {t('resplit', { count: p.resplitCount })}.
            <span className="muted small"> {t('resplitHint')}</span>
          </span>
        </label>
      )}
    </div>
  );
}
