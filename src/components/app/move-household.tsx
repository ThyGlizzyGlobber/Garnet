'use client';

import { useTranslations } from 'next-intl';
import { Button, Select } from '@/components/ui';
import { SectionHead } from '@/components/ui/blocks';

/**
 * "Move to another household": for people in more than one household, send a
 * bill (or a document waiting in the Inbox) that came into the wrong one to
 * another of theirs. It's analysed again there and opens there.
 */
export function MoveHousehold({
  action,
  hidden,
  households,
  error,
}: {
  action: (fd: FormData) => Promise<void>;
  /** documentId or billId. */
  hidden: Record<string, string>;
  households: { memberId: string; name: string }[];
  error?: string | null;
}) {
  const t = useTranslations('bills.moveHousehold');
  return (
    <form
      action={action}
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        const sel = e.currentTarget.elements.namedItem('memberId') as HTMLSelectElement | null;
        const name = sel?.selectedOptions[0]?.textContent ?? '';
        if (!window.confirm(t('confirm', { household: name }))) e.preventDefault();
      }}
    >
      <SectionHead title={t('title')} />
      <p className="muted small">{t('body')}</p>
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <Select name="memberId" aria-label={t('label')} className="min-w-0 flex-1">
          {households.map((h) => (
            <option key={h.memberId} value={h.memberId}>
              {h.name}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="secondary" icon="arrow-right">
          {t('button')}
        </Button>
      </div>
      {error && <span className="fld-h bad-text">{error}</span>}
    </form>
  );
}
