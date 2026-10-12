import { getTranslations } from 'next-intl/server';
import { Button, Card, Field, Input, LinkButton, Select } from '@/components/ui';
import { PageTitle } from '@/components/ui/blocks';
import { BackLink } from '@/components/ui/controls';
import { ActionForm } from '@/components/ui/form';
import { ListRow } from '@/components/ui/list-row';
import { pageContext } from '@/lib/context';
import { addMonths } from '@/lib/periods';
import { listServices, listServiceTypes } from '@/lib/services';
import { addYearlyBillAction } from '../actions';

/** The kinds a yearly bill usually is, first in the picker; the rest follow. */
const USUAL = [
  'vehicle_registration',
  'car_insurance',
  'building_insurance',
  'contents_insurance',
  'health_insurance',
  'council_rates',
  'land_tax',
  'strata',
  'roadside_assistance',
  'other',
];
const CADENCE_CHOICES = ['annual', 'quarterly', 'bimonthly', 'monthly'] as const;

/**
 * Yearly bills by hand (SCOPE-redesign-2.md §5 quick-add): a name, the usual
 * amount, how often and roughly when. Each becomes a service that the year
 * ahead counts until its real bill arrives. The ones already added are
 * listed above the form.
 */
export default async function YearlyBillsPage() {
  const ctx = await pageContext();
  const { hh, me, money, month } = ctx;
  const t = await getTranslations('budget');
  const tq = await getTranslations('budget.quick');
  const types = listServiceTypes();
  const ordered = [
    ...USUAL.map((slug) => types.find((ty) => ty.slug === slug)).filter(
      (ty): ty is NonNullable<typeof ty> => !!ty,
    ),
    ...types.filter((ty) => !USUAL.includes(ty.slug)),
  ];
  const thisMonth = ctx.today.slice(0, 7);
  const months = Array.from({ length: 12 }, (_, i) => addMonths(thisMonth, i));
  const added = listServices(hh.id, { viewer: me.id }).filter(
    (s) => s.expectedAmountMinor && s.expectedOn,
  );
  const dmy = new Intl.DateTimeFormat(hh.locale, {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

  return (
    <div className="scr">
      <BackLink href="/budget">{t('title')}</BackLink>
      <PageTitle
        title={tq('title')}
        lede={tq('lede')}
        right={
          <LinkButton href="/budget" variant="secondary">
            {tq('done')}
          </LinkButton>
        }
      />
      {added.length > 0 && (
        <section className="rd-card" aria-label={tq('listTitle')}>
          <div className="ghead">
            <h2>{tq('listTitle')}</h2>
          </div>
          {added.map((s) => (
            <ListRow
              key={s.id}
              href={`/services/${s.id}`}
              icon={s.type.icon}
              name={s.name}
              sub={tq('listLine', {
                amount: money(s.expectedAmountMinor!),
                cadence: tq(`cadences.${s.cadence}`),
                date: dmy.format(new Date(`${s.expectedOn}T00:00:00Z`)),
              })}
              end={null}
              noStat
            />
          ))}
        </section>
      )}
      <Card>
        <ActionForm
          action={addYearlyBillAction}
          submitLabel={tq('add')}
          className="bg-form"
          hideSubmit
        >
          {(errors, pending) => (
            <>
              <Field label={tq('name')} error={errors.name}>
                <Input name="name" required placeholder={tq('namePlaceholder')} maxLength={60} />
              </Field>
              <Field label={tq('amount', { currency: hh.currency })} error={errors.amount}>
                <Input name="amount" inputMode="decimal" required placeholder="825" />
              </Field>
              <Field label={tq('cadence')} error={errors.cadence}>
                <Select name="cadence" defaultValue="annual">
                  {CADENCE_CHOICES.map((c) => (
                    <option key={c} value={c}>
                      {tq(`cadences.${c}`)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={tq('when')} hint={tq('whenHint')} error={errors.when}>
                <Select name="when" defaultValue={months[1]}>
                  {months.map((m) => (
                    <option key={m} value={m}>
                      {month(m, 'long-year')}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('whereItGoes')} error={errors.type}>
                <Select name="type" defaultValue="other">
                  {ordered.map((ty) => (
                    <option key={ty.slug} value={ty.slug}>
                      {ty.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="form-acts">
                <Button type="submit" disabled={pending}>
                  {tq('add')}
                </Button>
              </div>
            </>
          )}
        </ActionForm>
      </Card>
    </div>
  );
}
