import { getTranslations } from 'next-intl/server';
import type { Household, Member } from '@/db/schema';
import { appUrl } from '@/lib/env';
import { composeEmail, sendEmail, type SendResult } from '@/lib/email';
import type { IssuedInvite } from '@/lib/invites';

export function inviteLink(token: string): string {
  return `${appUrl()}/invite/${token}`;
}

/** Email an invitation (link + typed code). Copy comes from messages/*.json. */
export async function sendInviteEmail(
  issued: IssuedInvite,
  hh: Household,
  inviter: Member,
): Promise<SendResult> {
  if (!issued.invite.email) return { sent: false, reason: 'No email address' };
  const t = await getTranslations('email.invite');
  const app = (await getTranslations('app'))('name');
  const vars = { inviter: inviter.name, household: hh.name, app };
  return sendEmail(
    composeEmail({
      to: issued.invite.email,
      subject: t('subject', vars),
      blocks: [
        { p: t('intro', vars) },
        { button: { label: t('button'), href: inviteLink(issued.token) } },
        { p: t('codeLine', { url: appUrl() }) },
        { code: issued.code },
      ],
      footer: t('expiry'),
    }),
  );
}
