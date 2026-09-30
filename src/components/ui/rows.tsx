import Link from 'next/link';
import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Icon } from '@/components/app/icons';
import { colourCss } from '@/lib/palette';
import { Chip, DocChip, StatusChip, type DocState, type Tone } from './chip';
import { Avatar, Disc } from './colour';
import { cx } from './cx';

/**
 * The one bill row, the one document row, a file on a bill and a share of a
 * bill (BRAND.md §7). Each takes a small view model of formatted strings, so
 * the numbers stay in src/lib and the rows only lay them out. A row is a
 * link: a bill has one page, wherever it is listed.
 */

interface RowStatus {
  label: string;
  tone: Tone;
}
interface RowTag {
  label: string;
  tone: Tone;
  icon?: string;
}
/** One instalment's place in the plan: paid, the next one due, or later. */
type InstalmentState = 'done' | 'next' | 'later';

export interface BillRowModel {
  href: string;
  /** The service's name; inside a service, the period instead. */
  title: string;
  /** Beside the title, unless the row is inside that provider's service. */
  provider?: string;
  /** The period and usage, or the instalment line. */
  sub: string;
  amount: string;
  status: RowStatus;
  /** "You $215.80": the viewer's own share, where it helps. */
  share?: string;
  tags?: RowTag[];
  instalments?: InstalmentState[];
  disc?: { icon: string; colour: string };
  /** The service colour when there's no disc (the row still tints from it). */
  colour?: string;
  current?: boolean;
}

/** A list of rows with a hairline between them (and a container for the narrow layout). */
export function Rows({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('rows', className)}>{children}</div>;
}

export function InstDots({ states, label }: { states: InstalmentState[]; label: string }) {
  return (
    <span className="inst-dots" aria-label={label}>
      {states.map((s, i) => (
        <i key={i} className={s === 'later' ? undefined : s} />
      ))}
    </span>
  );
}

export function BillRow({ bill: b }: { bill: BillRowModel }) {
  const t = useTranslations('ui');
  const colour = b.disc?.colour ?? b.colour;
  const tags = b.tags ?? [];
  return (
    <Link
      href={b.href}
      className={cx('bill-row', b.current && 'on')}
      style={colour ? { ['--svc' as string]: colourCss(colour) } : undefined}
    >
      {b.disc && <Disc icon={b.disc.icon} colour={b.disc.colour} size="sm" />}
      <span className="br-main">
        <span className="br-title">
          {b.title}
          {b.provider && <span className="br-prov">{b.provider}</span>}
        </span>
        <span className="br-sub">{b.sub}</span>
        {(b.instalments || tags.length > 0) && (
          <span className="br-tags">
            {b.instalments && <InstDots states={b.instalments} label={t('instalments')} />}
            {tags.map((tag) => (
              <Chip key={tag.label} tone={tag.tone} icon={tag.icon}>
                {tag.label}
              </Chip>
            ))}
          </span>
        )}
      </span>
      <span className="br-end">
        <span className="br-amt">{b.amount}</span>
        {b.share && <span className="br-share">{b.share}</span>}
        <StatusChip status={b.status} />
      </span>
    </Link>
  );
}

/** What kind of file a document is; email and photo get their own marks. */
type DocType = 'pdf' | 'email' | 'photo' | 'scan';
const docIcon: Record<DocType, string> = {
  pdf: 'file',
  scan: 'photo',
  email: 'mail',
  photo: 'photo',
};
const docMark: Record<DocType, string> = { pdf: 'PDF', scan: 'PDF', email: 'EML', photo: 'JPG' };

/** The little document icon with its file type underneath. */
function DocIcon({ type, small = false }: { type: DocType; small?: boolean }) {
  return (
    <span className={cx('doc-ic', small && 'sm')} aria-hidden="true">
      <Icon name={docIcon[type]} width={19} height={19} />
      <i>{docMark[type]}</i>
    </span>
  );
}

export interface DocRowModel {
  href: string;
  title: string;
  /** "Bill · Forwarded by Jordan · 8 Sep" */
  sub: string;
  type: DocType;
  state: DocState;
  /** "1 detail to confirm", when something needs a look. */
  needs?: string;
  /** "Electricity · $486.21": the bill it made, when listing with bills. */
  bill?: string;
  current?: boolean;
}

export function DocRow({ doc: d }: { doc: DocRowModel }) {
  return (
    <Link href={d.href} className={cx('doc-row', d.needs && 'needs', d.current && 'on')}>
      <DocIcon type={d.type} />
      <span className="dr-main">
        <span className="dr-title">{d.title}</span>
        <span className="dr-sub">{d.sub}</span>
      </span>
      <span className="dr-end">
        <DocChip state={d.state} />
        {d.needs && (
          <Chip tone="warn" icon="pencil">
            {d.needs}
          </Chip>
        )}
        {d.bill && <span className="dr-bill">{d.bill}</span>}
      </span>
    </Link>
  );
}

export interface FileRowModel {
  type: DocType;
  name: string;
  /** "Forwarded by Jordan · 8 Sep · 2 pages" */
  sub: string;
  /** The signed sender's domain, when the email was verified. */
  verified?: string;
  state?: DocState;
}

/** A file that came with a bill, on the bill's page. `children` goes at the end (a button). */
export function FileRow({ file: f, children }: { file: FileRowModel; children?: ReactNode }) {
  const t = useTranslations('ui');
  return (
    <div className="file-row">
      <DocIcon type={f.type} />
      <span className="fr-main">
        <b>{f.name}</b>
        <span className="muted">{f.sub}</span>
        {f.verified && (
          <span className="verified">
            <Icon name="shield" width={12} height={12} />
            {t('verified', { domain: f.verified })}
          </span>
        )}
      </span>
      {children ?? <DocChip state={f.state ?? 'analysed'} />}
    </div>
  );
}

/** A bill entered by hand: who and when, with room for an "Attach file" button. */
export function FileRowManual({
  title,
  sub,
  children,
}: {
  title: string;
  sub: string;
  children?: ReactNode;
}) {
  return (
    <div className="file-row manual">
      <Icon name="pencil" width={18} height={18} />
      <span>
        <b>{title}</b>
        <span className="muted">{sub}</span>
      </span>
      {children}
    </div>
  );
}

export interface ShareRowModel {
  member: { name: string; colour: string };
  /** "You" or the name. */
  who: string;
  /** "Moved in 1 Aug", when it explains a smaller share. */
  note?: string;
  amount: string;
  state: RowTag;
}

export function ShareRow({ share: s }: { share: ShareRowModel }) {
  return (
    <div className="share-row">
      <Avatar name={s.member.name} colour={s.member.colour} size="sm" />
      <span className="sr-name">
        {s.who}
        {s.note && <span className="muted small">{s.note}</span>}
      </span>
      <span className="sr-amt">{s.amount}</span>
      <Chip tone={s.state.tone} icon={s.state.icon}>
        {s.state.label}
      </Chip>
    </div>
  );
}
