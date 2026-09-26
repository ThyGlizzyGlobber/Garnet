import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { currentMember } from '@/lib/auth/session';
import { isSetUp, listHouseholds } from '@/lib/households';
import { listMembers } from '@/lib/members';
import { LoginForm } from './login-form';

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  if (!isSetUp()) redirect('/setup');
  if (await currentMember()) redirect('/');
  const t = await getTranslations('login');
  // Interim until accounts (stage 2): one list across households, labelled when there are several.
  const households = listHouseholds();
  const several = households.length > 1;
  const members = households.flatMap((h) =>
    listMembers(h.id).map((m) => ({
      id: m.id,
      name: several ? `${m.name} · ${h.name}` : m.name,
      colour: m.colour,
    })),
  );
  return (
    <>
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-10">
        {!several && households[0] && (
          <p className="text-sm font-medium text-fg-muted">{households[0].name}</p>
        )}
        <h1 className="mt-1 mb-6 text-3xl font-semibold tracking-tight">{t('title')}</h1>
        <LoginForm members={members} next={next ?? ''} />
      </main>
    </>
  );
}
