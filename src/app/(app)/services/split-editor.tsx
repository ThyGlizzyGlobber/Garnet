'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { formatMoney, parseMoneyToMinor } from '@/lib/format';
import { computeShares, splitProblem } from '@/lib/splits';

export interface SplitMemberOption {
  id: string;
  name: string;
  colour: string;
  splitWeight: number;
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
 * How a household service is split, for admins: evenly, by percentage (they
 * must add up to 100%), or set amounts per bill (anyone left blank shares
 * what's left evenly). Shows what each person would pay of the latest bill.
 */
export function SplitEditor(p: SplitEditorProps) {
  const t = useTranslations('services.split');
  const ids = p.members.map((m) => m.id);
  const [mode, setMode] = useState(p.initialMode);
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
          payerMemberId: p.payerMemberId || null,
        })
      : [];

  return (
    <div className="flex flex-col gap-4">
      <div
        role="radiogroup"
        aria-label={t('how')}
        className="grid gap-1 rounded-2xl bg-surface-2 p-1"
        style={{ gridTemplateColumns: `repeat(${modes.length}, minmax(0, 1fr))` }}
      >
        {modes.map((m) => (
          <label
            key={m}
            className={`cursor-pointer rounded-xl px-2 py-2 text-center text-sm font-medium transition ${mode === m ? 'bg-surface-solid text-fg shadow-sm' : 'text-fg-muted hover:text-fg'}`}
          >
            <input
              type="radio"
              name="splitMode"
              value={m}
              checked={mode === m}
              onChange={() => setMode(m)}
              className="sr-only"
            />
            {t(`modes.${m}`)}
          </label>
        ))}
      </div>
      <p className="-mt-1 text-xs text-fg-muted">{t(`hints.${mode}`)}</p>

      {(mode === 'percent' || mode === 'fixed') && (
        <ul className="flex flex-col gap-2">
          {p.members.map((m) => (
            <li key={m.id} className="flex items-center gap-3">
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ background: m.colour }}
                aria-hidden
              />
              <label
                htmlFor={`split_${m.id}`}
                className="min-w-0 flex-1 truncate text-sm font-medium"
              >
                {m.name}
              </label>
              <div className="flex w-40 items-center gap-1.5 rounded-xl border border-border-strong bg-surface-2 px-3 focus-within:border-accent">
                {mode === 'fixed' && <span className="text-sm text-fg-muted">{sign}</span>}
                <input
                  id={`split_${m.id}`}
                  name={mode === 'percent' ? `pct_${m.id}` : `amt_${m.id}`}
                  inputMode="decimal"
                  autoComplete="off"
                  value={mode === 'percent' ? (percents[m.id] ?? '') : (amounts[m.id] ?? '')}
                  placeholder={mode === 'percent' ? '0' : t('restPlaceholder')}
                  onChange={(e) =>
                    mode === 'percent'
                      ? setPercents({ ...percents, [m.id]: e.target.value })
                      : setAmounts({ ...amounts, [m.id]: e.target.value })
                  }
                  className="h-10 min-w-0 flex-1 bg-transparent text-right text-sm tabular-nums outline-none"
                />
                {mode === 'percent' && <span className="text-sm text-fg-muted">%</span>}
              </div>
            </li>
          ))}
        </ul>
      )}

      {mode === 'percent' && (
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className={pctOk ? 'text-fg-muted' : 'font-medium text-warning'}>
            {pctOk ? t('pctTotal', { total: pctTotal }) : t('pctOff', { total: pctTotal })}
            <span className="block text-xs font-normal text-fg-muted">{t('newMembers')}</span>
          </span>
          <button
            type="button"
            className="text-xs font-medium text-accent hover:underline"
            onClick={() => setPercents(evenPercents(ids))}
          >
            {t('evenly')}
          </button>
        </div>
      )}

      {mode === 'fixed' && (
        <p className="text-xs text-fg-muted">
          {blanks.length
            ? t('fixedRest', {
                total: money(setTotal),
                names: blanks.map((m) => m.name).join(', '),
                count: blanks.length,
              })
            : t('fixedAll', { total: money(setTotal) })}
        </p>
      )}

      {preview.length > 0 && (
        <div className="rounded-xl bg-surface-2 px-4 py-3">
          <p className="text-xs text-fg-muted">{t('preview', { amount: money(example) })}</p>
          <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-surface">
            {preview.map((s) => (
              <span
                key={s.memberId}
                style={{
                  width: `${(s.amountMinor * 100) / example}%`,
                  background: p.members.find((m) => m.id === s.memberId)?.colour,
                }}
              />
            ))}
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {preview.map((s) => (
              <li key={s.memberId}>
                {p.members.find((m) => m.id === s.memberId)?.name}{' '}
                <span className="font-semibold tabular-nums">{money(s.amountMinor)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {p.resplitCount > 0 && (
        <label className="flex items-start gap-3 text-sm font-medium">
          <input
            type="checkbox"
            name="resplit"
            checked={resplit}
            onChange={(e) => setResplit(e.target.checked)}
            className="mt-0.5 size-5 accent-accent"
          />
          <span>
            {t('resplit', { count: p.resplitCount })}
            <span className="block text-xs font-normal text-fg-muted">{t('resplitHint')}</span>
          </span>
        </label>
      )}
    </div>
  );
}
