import { getTranslations } from 'next-intl/server';
import { Button, Card, Field, Input } from '@/components/ui';
import { PageTitle } from '@/components/ui/blocks';
import { BackLink } from '@/components/ui/controls';
import { ActionForm } from '@/components/ui/form';
import { budgetView } from '@/lib/budget';
import { pageContext } from '@/lib/context';
import { formatMinorPlain } from '@/lib/format';
import { isAdmin } from '@/lib/roles';
import { saveBudgetAction } from '../actions';

/** The yearly budget: one amount for the whole year (admins); blank for none. */
export default async function EditBudgetPage() {
  const ctx = await pageContext();
  const { hh, me } = ctx;
  const t = await getTranslations('budget');
  const te = await getTranslations('budget.edit');
  const v = budgetView(hh, me, ctx.today);
  const yearShort =
    v.basis === 'fy'
      ? t('fyShort', { from: v.startYear, to: String(v.startYear + 1).slice(2) })
      : t('cyShort', { year: v.startYear });
  const admin = isAdmin(me);
  return (
    <div className="scr">
      <BackLink href="/budget">{t('title')}</BackLink>
      <PageTitle
        title={te('title')}
        lede={admin ? te('lede', { year: yearShort }) : te('adminsOnly')}
      />
      <Card>
        {admin ? (
          <ActionForm
            action={saveBudgetAction}
            submitLabel={te('save')}
            className="bg-form"
            hideSubmit
          >
            {(errors, pending) => (
              <>
                <Field
                  label={te('amount', { currency: hh.currency })}
                  hint={te('hint')}
                  error={errors.amount}
                >
                  <Input
                    name="amount"
                    inputMode="decimal"
                    defaultValue={
                      v.budgetMinor !== null ? formatMinorPlain(v.budgetMinor, hh.currency) : ''
                    }
                    placeholder="38000"
                  />
                </Field>
                <div className="form-acts">
                  <Button type="submit" disabled={pending}>
                    {te('save')}
                  </Button>
                  {v.budgetMinor !== null && (
                    <Button type="submit" variant="ghost" name="clear" value="1" disabled={pending}>
                      {te('clear')}
                    </Button>
                  )}
                </div>
              </>
            )}
          </ActionForm>
        ) : (
          <p className="muted">{te('adminsOnly')}</p>
        )}
      </Card>
    </div>
  );
}
