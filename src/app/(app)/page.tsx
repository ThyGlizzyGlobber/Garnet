import { getTranslations } from 'next-intl/server';
import { Card, LinkButton, PageHeader } from '@/components/ui';
import { listBills } from '@/lib/bills';
import { pageContext } from '@/lib/context';
import { listMembers } from '@/lib/members';
import { listServices } from '@/lib/services';

export default async function HomePage() {
  const { hh, me, money } = await pageContext();
  const t = await getTranslations('home');
  const bills = listBills(undefined, { limit: 5 });
  const services = listServices();
  const members = listMembers();
  const total = bills.reduce((s, b) => s + b.amountMinor, 0);
  return (
    <>
      <PageHeader
        title={t('greeting', { name: me.name })}
        subtitle={hh.name}
        action={<LinkButton href="/bills/new">{t('addBill')}</LinkButton>}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-sm text-fg-muted">{t('recentTotal')}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{money(total)}</p>
        </Card>
        <Card>
          <p className="text-sm text-fg-muted">{t('services')}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{services.length}</p>
        </Card>
        <Card>
          <p className="text-sm text-fg-muted">{t('members')}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{members.length}</p>
        </Card>
      </div>
      <Card className="mt-4">
        <p className="text-sm text-fg-muted">{t('phaseNote')}</p>
      </Card>
    </>
  );
}
