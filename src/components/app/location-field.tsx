'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Field, Input, Select } from '@/components/ui';

interface Place {
  postcode: string;
  locality: string;
  stateCode: string;
}

/** Countries offered in the picker; those with postcode data get suburb search. */
const COUNTRIES = [
  'AU',
  'NZ',
  'GB',
  'IE',
  'US',
  'CA',
  'ZA',
  'SG',
  'IN',
  'AE',
  'DE',
  'FR',
  'NL',
  'BE',
  'ES',
  'PT',
  'IT',
  'CH',
  'AT',
  'SE',
  'NO',
  'DK',
  'FI',
  'JP',
  'BR',
  'AR',
  'CL',
  'MX',
];

/**
 * Country + postcode, never an address. Where the app has postcode data,
 * typing a postcode or a suburb offers matches to pick from; elsewhere it's a
 * plain postcode box. Submits country, postalCode and locality.
 */
export function LocationField({
  withData,
  initial,
  errors = {},
  optional = false,
}: {
  /** Countries with postcode data (e.g. ["AU"]). */
  withData: string[];
  initial: { country: string; postalCode: string; locality: string };
  errors?: Record<string, string | undefined>;
  optional?: boolean;
}) {
  const t = useTranslations('location');
  const locale = useLocale();
  const names = useMemo(() => new Intl.DisplayNames([locale], { type: 'region' }), [locale]);
  const countries = useMemo(
    () =>
      [...new Set([initial.country, ...COUNTRIES].filter(Boolean))]
        .map((code) => ({ code, name: names.of(code) ?? code }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [initial.country, names],
  );
  const [country, setCountry] = useState(initial.country || 'AU');
  const [picked, setPicked] = useState<Place | null>(
    initial.postalCode
      ? { postcode: initial.postalCode, locality: initial.locality, stateCode: '' }
      : null,
  );
  const [query, setQuery] = useState('');
  const [places, setPlaces] = useState<Place[]>([]);
  const searchable = withData.includes(country);
  // Matches only while there's something to match (no reset needed in the effect).
  const shown = searchable && query.trim().length >= 2 ? places : [];

  useEffect(() => {
    if (!searchable || query.trim().length < 2) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/places?country=${country}&q=${encodeURIComponent(query.trim())}`, {
        signal: ctrl.signal,
      })
        .then((r) => (r.ok ? r.json() : { places: [] }))
        .then((d: { places: Place[] }) => setPlaces(d.places))
        .catch(() => {});
    }, 200);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [country, query, searchable]);

  return (
    <div className="flex flex-col gap-3">
      <Field label={t('country')} error={errors.country}>
        <Select
          name="country"
          value={country}
          onChange={(e) => {
            setCountry(e.target.value);
            setPicked(null);
            setQuery('');
          }}
        >
          {countries.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      {searchable ? (
        <Field
          label={optional ? t('placeOptional') : t('place')}
          hint={t('placeHint')}
          error={errors.postalCode}
        >
          <div className="flex flex-col gap-2">
            {picked && (
              <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface-2 px-4 py-2 text-sm">
                <span>
                  {picked.locality}
                  {picked.stateCode && ` ${picked.stateCode}`} {picked.postcode}
                </span>
                <button
                  type="button"
                  className="text-xs font-semibold text-accent"
                  onClick={() => setPicked(null)}
                >
                  {t('change')}
                </button>
              </div>
            )}
            {!picked && (
              <>
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('placePlaceholder')}
                  autoComplete="off"
                  aria-label={t('place')}
                />
                {shown.length > 0 && (
                  <ul className="max-h-60 overflow-auto rounded-2xl border border-border-strong bg-surface-solid text-sm">
                    {shown.map((p) => (
                      <li key={`${p.postcode}-${p.locality}`}>
                        <button
                          type="button"
                          className="w-full px-4 py-2 text-left hover:bg-surface-2"
                          onClick={() => {
                            setPicked(p);
                            setPlaces([]);
                          }}
                        >
                          {p.locality} {p.stateCode} {p.postcode}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
            <input type="hidden" name="postalCode" value={picked?.postcode ?? query.trim()} />
            <input type="hidden" name="locality" value={picked?.locality ?? ''} />
          </div>
        </Field>
      ) : (
        <Field
          label={optional ? t('postcodeOptional') : t('postcode')}
          hint={t('noDataHint')}
          error={errors.postalCode}
        >
          <Input
            name="postalCode"
            defaultValue={initial.country === country ? initial.postalCode : ''}
            autoComplete="postal-code"
            maxLength={10}
          />
        </Field>
      )}
    </div>
  );
}
