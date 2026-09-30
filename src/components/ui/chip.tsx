import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Icon } from '@/components/app/icons';
import { cx } from './cx';

/** What a chip's colour means. Every chip is a word beside a coloured dot, never colour alone. */
export type Tone = 'ok' | 'warn' | 'bad' | 'neutral' | 'info' | 'analysed';

/** The icon that goes with a tone (hidden in Frost Glass, kept for other packs and screen readers). */
const toneIcon: Record<Tone, string> = {
  ok: 'check',
  warn: 'clock',
  bad: 'alert',
  neutral: 'calendar',
  info: 'info',
  analysed: 'check',
};

/** A word with a coloured dot: a status, a tag, a count. */
export function Chip({
  tone = 'neutral',
  icon,
  className,
  children,
}: {
  tone?: Tone;
  icon?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className={cx('chip', `t-${tone}`, className)}>
      {icon && <Icon name={icon} width={13} height={13} />}
      <span>{children}</span>
    </span>
  );
}

/** A status the numbers gave us: label plus tone (from a view function). */
export function StatusChip({ status }: { status: { label: string; tone: Tone } }) {
  return (
    <Chip tone={status.tone} icon={toneIcon[status.tone]}>
      {status.label}
    </Chip>
  );
}

/** The only processing words a document ever gets. */
export type DocState = 'analysed' | 'waiting' | 'failed';

export function DocChip({ state }: { state: DocState }) {
  const t = useTranslations('ui.doc');
  if (state === 'waiting')
    return (
      <Chip tone="neutral" icon="clock">
        {t('waiting')}
      </Chip>
    );
  if (state === 'failed')
    return (
      <Chip tone="bad" icon="alert">
        {t('failed')}
      </Chip>
    );
  return (
    <Chip tone="analysed" icon="check">
      {t('analysed')}
    </Chip>
  );
}
