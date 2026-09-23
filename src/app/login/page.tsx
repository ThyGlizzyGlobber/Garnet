import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { currentMember } from '@/lib/auth/session';
import { getHousehold } from '@/lib/households';
import { listMembers } from '@/lib/members';
import { LoginForm } from './login-form';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const hh = getHousehold();
  if (!hh) redirect('/setup');
  if (await currentMember()) redirect('/');
  const t = await getTranslations('login');
  const members = listMembers().map((m) => ({ id: m.id, name: m.name, colour: m.colour }));
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-10">
      <p className="text-sm font-medium text-fg-muted">{hh.name}</p>
      <h1 className="mt-1 mb-6 text-3xl font-semibold tracking-tight">{t('title')}</h1>
      <LoginForm members={members} />
    </main>
  );
}
