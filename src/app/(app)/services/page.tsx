import { getTranslations } from 'next-intl/server';
import {
  Badge,
  Card,
  EmptyState,
  Field,
  Input,
  LinkButton,
  List,
  ListRow,
  PageHeader,
  Select,
} from '@/components/ui';
import { Icon } from '@/components/app/icons';
import { Button } from '@/components/ui';
import { pageContext } from '@/lib/context';
import { listMembers } from '@/lib/members';
import { listServices, listServiceTypes } from '@/lib/services';
import { listUnits, unitLabel } from '@/lib/units';
import { createServiceTypeAction } from './actions';

export default async function ServicesPage() {
  const { hh } = await pageContext();
  const t = await getTranslations('services');
  const services = listServices(undefined, true);
  const members = new Map(listMembers().map((m) => [m.id, m.name]));
  const types = listServiceTypes();
  return (
    <>
      <PageHeader
        title={t('title')}
        action={<LinkButton href="/services/new">{t('add')}</LinkButton>}
      />
      {services.length === 0 ? (
        <EmptyState
          title={t('empty.title')}
          body={t('empty.body')}
          action={<LinkButton href="/services/new">{t('add')}</LinkButton>}
        />
      ) : (
        <List>
          {services.map((s) => (
            <ListRow key={s.id} href={`/services/${s.id}/edit`}>
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className="grid size-10 shrink-0 place-items-center rounded-xl text-white"
                  style={{ background: s.colour }}
                >
                  <Icon name={s.type.icon} />
                </span>
                <div className="min-w-0">
                  <p className="truncate font-semibold">{s.name}</p>
                  <p className="truncate text-xs text-fg-muted">
                    {s.provider} · {t(`form.cadences.${s.cadence}`)}
                    {s.usageUnit && ` · ${unitLabel(s.usageUnit)}`}
                    {hh.splitMode === 'shared' &&
                      s.payerMemberId &&
                      ` · ${t('paidBy', { name: members.get(s.payerMemberId) ?? '?' })}`}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {!s.isActive && <Badge>{t('inactive')}</Badge>}
                {hh.splitMode === 'shared' && (
                  <Badge tone="accent">{t(`form.splitModes.${s.splitMode}`)}</Badge>
                )}
              </div>
            </ListRow>
          ))}
        </List>
      )}
      <Card className="mt-6">
        <h2 className="font-semibold">{t('types.title')}</h2>
        <p className="mt-0.5 text-xs text-fg-muted">{t('types.body')}</p>
        <p className="mt-2 flex flex-wrap gap-1.5">
          {types.map((ty) => (
            <Badge key={ty.slug}>{ty.label}</Badge>
          ))}
        </p>
        <form action={createServiceTypeAction} className="mt-4 flex flex-wrap items-end gap-3">
          <Field label={t('types.label')}>
            <Input name="label" required placeholder={t('types.placeholder')} />
          </Field>
          <Field label={t('types.unit')}>
            <Select name="defaultUnit" defaultValue="">
              <option value="">—</option>
              {listUnits().map((u) => (
                <option key={u.key} value={u.key}>
                  {u.label}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit" variant="secondary">
            {t('types.add')}
          </Button>
        </form>
      </Card>
    </>
  );
}
