import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui';

/** The audit log comes with C3 (SCOPE-console.md §3f). */
export default async function ConsoleAuditPage() {
  const t = await getTranslations('console.tabs');
  return (
    <Card>
      <p className="muted">{t('audit')} · C3</p>
    </Card>
  );
}
