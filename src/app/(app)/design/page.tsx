import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { Button, LinkButton, PageHeader } from '@/components/ui';
import {
  AddressCard,
  Delta,
  Eyebrow,
  FigureRows,
  Kv,
  Money,
  Notice,
  Progress,
  SectionHead,
  Stats,
  Timeline,
} from '@/components/ui/blocks';
import { Chip, DocChip } from '@/components/ui/chip';
import { Avatar, Avatars, Disc, Swatch } from '@/components/ui/colour';
import { BackLink, IconButton, SearchField, Segmented, Toggle } from '@/components/ui/controls';
import { Arc, Ring } from '@/components/ui/ring';
import {
  BillRow,
  DocRow,
  FileRow,
  FileRowManual,
  Rows,
  ShareRow,
  type BillRowModel,
} from '@/components/ui/rows';
import { CalendarGrid } from '@/components/charts/calendar-grid';
import { PeriodBars } from '@/components/charts/period-bars';
import { ForecastPills } from '@/components/charts/pills';
import { Sparkline } from '@/components/charts/sparkline';
import { StackBar } from '@/components/charts/stack-bar';
import { TrendLine } from '@/components/charts/trend-line';
import { requireMember } from '@/lib/auth/session';
import { PALETTE } from '@/lib/palette';
import { SurfaceDemos } from './demos';

/**
 * The component pack, drawn with the same pieces the screens use, so it can
 * be checked side by side with the studio's Components view. Signed-in
 * members only; every figure is fictional.
 */

const blue = '#2a78d6';
const orange = '#eb6834';
const aqua = '#1baf7a';
const yellow = '#eda100';
const magenta = '#e87ba4';
const violet = '#4a3aa7';
const alex = { name: 'Alex', colour: blue };
const jordan = { name: 'Jordan', colour: aqua };
const sam = { name: 'Sam', colour: magenta };

const power: BillRowModel = {
  href: '#',
  title: 'Electricity',
  provider: 'Origin',
  sub: 'Jun – Aug · 1,684 kWh',
  amount: '$486.21',
  status: { label: 'Due tomorrow', tone: 'warn' },
  share: 'You $162.07',
  tags: [{ label: 'Unusual', tone: 'warn', icon: 'trend-up' }],
  disc: { icon: 'bolt', colour: yellow },
};
const rates: BillRowModel = {
  href: '#',
  title: 'Council rates',
  provider: 'City of Greater Bendigo',
  sub: 'Instalment 2 of 4 · $2,184.00 for the year',
  amount: '$546.00',
  status: { label: 'Due 30 Nov', tone: 'neutral' },
  instalments: ['done', 'next', 'later', 'later'],
  disc: { icon: 'landmark', colour: aqua },
};
const gas: BillRowModel = {
  href: '#',
  title: 'Gas',
  provider: 'AGL',
  sub: 'Jul – Aug · 7,340 MJ',
  amount: '$213.40',
  status: { label: 'Paid', tone: 'ok' },
  disc: { icon: 'flame', colour: orange },
};
const rego: BillRowModel = {
  href: '#',
  title: 'Car rego',
  provider: 'VicRoads',
  sub: 'Sep 2026 – Sep 2027',
  amount: '$912.50',
  status: { label: '5 days overdue', tone: 'bad' },
  tags: [{ label: 'Yours', tone: 'info', icon: 'user' }],
  disc: { icon: 'car', colour: violet },
};
const inService: BillRowModel[] = [
  {
    ...power,
    title: 'Jun – Aug 2026',
    provider: undefined,
    sub: 'Issued 8 Sep · 1,684 kWh',
    disc: undefined,
    colour: yellow,
  },
  {
    ...power,
    title: 'Mar – May 2026',
    provider: undefined,
    sub: 'Issued 9 Jun · 1,512 kWh',
    amount: '$438.90',
    status: { label: 'Paid', tone: 'ok' },
    share: undefined,
    tags: undefined,
    disc: undefined,
    colour: yellow,
  },
  {
    ...power,
    title: 'Dec – Feb 2026',
    provider: undefined,
    sub: 'Issued 10 Mar · 1,320 kWh',
    amount: '$401.12',
    status: { label: 'Paid', tone: 'ok' },
    share: undefined,
    tags: undefined,
    disc: undefined,
    colour: yellow,
  },
];

const monthly = [2412, 2380, 2455, 2390, 2620, 2510, 2480, 2530, 2690, 2985, 2960, 2985];
const months = ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'];

const spans = { 1: '', 2: 'md:col-span-2', 3: 'md:col-span-2 xl:col-span-3' };
const cols = {
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-2 xl:grid-cols-3',
  4: 'md:grid-cols-2 xl:grid-cols-4',
};

function Cell({
  label,
  span = 1,
  children,
}: {
  label: string;
  span?: keyof typeof spans;
  children: ReactNode;
}) {
  return (
    <div className={`glass p-5 ${spans[span]}`}>
      <div className="eyebrow mb-3">{label}</div>
      {children}
    </div>
  );
}

function Section({
  title,
  sub,
  columns = 4,
  children,
}: {
  title: string;
  sub?: string;
  columns?: keyof typeof cols;
  children: ReactNode;
}) {
  return (
    <section className="mb-8">
      <div className="mb-3">
        <h2 className="text-[21px]">{title}</h2>
        {sub && <p className="text-fg-2">{sub}</p>}
      </div>
      <div className={`grid gap-3.5 ${cols[columns]}`}>{children}</div>
    </section>
  );
}

export default async function DesignPage() {
  await requireMember();
  const t = await getTranslations('design');
  const today = '2026-09-29';
  const days = Array.from({ length: 35 }, (_, i) => {
    const d = new Date(Date.UTC(2026, 8, 21 + i));
    const date = d.toISOString().slice(0, 10);
    const day = d.getUTCDate();
    const dots: Record<string, string[]> = {
      '2026-09-30': [yellow],
      '2026-10-01': [violet, blue],
      '2026-10-15': [aqua],
      '2026-10-21': [orange],
    };
    return {
      date,
      label: day === 1 ? d.toLocaleString('en', { month: 'short', timeZone: 'UTC' }) : String(day),
      today: date === today,
      past: date < today,
      dots: dots[date],
      href: dots[date] ? '#' : undefined,
      done: date === '2026-09-30',
    };
  });
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={t('title')} subtitle={t('lede')} />

      <Section
        title="Foundations"
        sub="Colour comes from the preset; type, shape and glass from the pack."
      >
        <Cell label="Colour tokens" span={2}>
          <div className="grid grid-cols-3 gap-2 text-sm sm:grid-cols-4">
            {[
              ['Accent', 'var(--p-accent)'],
              ['Accent 2', 'var(--p-accent2)'],
              ['Text', 'var(--p-fg)'],
              ['Secondary', 'var(--p-fg2)'],
              ['Paid', 'var(--ok)'],
              ['Due', 'var(--warn)'],
              ['Overdue', 'var(--bad)'],
              ['Scene 1', 'var(--p-glow1)'],
              ['Scene 2', 'var(--p-glow2)'],
              ['Scene 3', 'var(--p-glow3)'],
            ].map(([n, v]) => (
              <div key={n} className="flex items-center gap-2">
                <i className="size-5 rounded-full" style={{ background: v }} />
                <span>{n}</span>
              </div>
            ))}
          </div>
        </Cell>
        <Cell label="Type" span={2}>
          <div className="grid gap-2">
            <div className="text-[40px] leading-[1.05]">Hey, Alex.</div>
            <div className="text-[21px]">September so far</div>
            <div>Two payments due this week, $761.80 in total.</div>
            <div className="small muted">Forwarded by Jordan · 8 Sep</div>
            <Eyebrow>Eyebrow label</Eyebrow>
            <div className="mono">NW-4471-202609</div>
            <Money minor={48621} currency="AUD" locale="en-AU" className="hero-fig" />
          </div>
        </Cell>
        <Cell label="Glass materials" span={2}>
          <div className="grid grid-cols-3 gap-3">
            <div className="glass grid gap-0.5 p-4">
              <b>Glass</b>
              <span className="small muted">Tiles, widgets</span>
            </div>
            <div className="glass-strong grid gap-0.5 p-4">
              <b>Strong</b>
              <span className="small muted">Nav, sheets</span>
            </div>
            <div className="well grid gap-0.5 p-4">
              <b>Well</b>
              <span className="small muted">Inside a tile</span>
            </div>
          </div>
        </Cell>
        <Cell label="Service colours" span={2}>
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            {PALETTE.map((p, i) => (
              <div key={p.name} className="flex items-center gap-2">
                <Disc
                  icon={['bolt', 'flame', 'drop', 'wifi', 'home', 'landmark', 'car', 'heart'][i]!}
                  colour={p.light}
                  size="sm"
                />
                <span className="capitalize">{p.name}</span>
              </div>
            ))}
          </div>
        </Cell>
      </Section>

      <Section title="Controls" sub="Buttons, switches and inputs." columns={3}>
        <Cell label="Buttons">
          <div className="mb-2 flex flex-wrap gap-2">
            <Button icon="check">Mark my $215.80 paid</Button>
            <Button variant="secondary" icon="pencil">
              Edit
            </Button>
            <Button variant="ghost" icon="eye">
              View PDF
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" icon="plus">
              Add bill
            </Button>
            <Button variant="secondary" size="sm" icon="bell">
              Remind
            </Button>
            <LinkButton href="#" variant="ghost" size="sm" icon="copy">
              Copy
            </LinkButton>
            <Button variant="danger" size="sm">
              Delete
            </Button>
          </div>
        </Cell>
        <Cell label="Icon buttons">
          <div className="flex flex-wrap items-center gap-2">
            <IconButton icon="search" label="Search" />
            <IconButton icon="inbox" label="Inbox" badge={1} />
            <IconButton icon="plus" label="Add" accent />
            <IconButton icon="more" label="More" />
            <button className="me">
              <Avatar name="Alex" colour={blue} />
            </button>
            <BackLink href="#">Electricity</BackLink>
          </div>
        </Cell>
        <Cell label="Segmented">
          <div className="grid gap-2">
            <Segmented
              items={[
                { value: 'all', label: 'All' },
                { value: 'household', label: 'Household' },
                { value: 'mine', label: 'Mine' },
              ]}
              value="household"
              label="Whose"
            />
            <Segmented
              small
              items={[
                { value: 'all', label: 'All' },
                { value: 'topay', label: 'To pay' },
                { value: 'paid', label: 'Paid' },
              ]}
              value="all"
              label="Status"
            />
            <Segmented
              small
              items={[
                { value: 'light', label: 'Light', icon: 'sun' },
                { value: 'dark', label: 'Dark', icon: 'moon' },
                { value: 'auto', label: 'Automatic', icon: 'devices' },
              ]}
              value="auto"
              label="Theme"
            />
          </div>
        </Cell>
        <Cell label="Switches">
          <div className="grid gap-3">
            <div className="flex items-center gap-3">
              <Toggle label="On" defaultChecked />
              <span>Everyone can download the household’s bills</span>
            </div>
            <div className="flex items-center gap-3">
              <Toggle label="Off" />
              <span>Share area comparisons</span>
            </div>
          </div>
        </Cell>
        <Cell label="Fields">
          <div className="grid gap-3">
            <SearchField placeholder="Search bills, services, amounts" />
            <label className="field">
              <span>Amount</span>
              <input type="text" defaultValue="$486.21" />
            </label>
          </div>
        </Cell>
        <Cell label="Chips" span={3}>
          <div className="flex flex-wrap gap-2">
            <DocChip state="analysed" />
            <DocChip state="waiting" />
            <DocChip state="failed" />
            <Chip tone="ok" icon="check">
              Paid
            </Chip>
            <Chip tone="warn" icon="clock">
              Due tomorrow
            </Chip>
            <Chip tone="bad" icon="alert">
              5 days overdue
            </Chip>
            <Chip tone="neutral" icon="calendar">
              Due 18 Oct
            </Chip>
            <Chip tone="warn" icon="trend-up">
              Unusual
            </Chip>
            <Chip tone="info" icon="user">
              Yours
            </Chip>
            <Chip tone="warn" icon="pencil">
              1 detail to confirm
            </Chip>
            <Chip tone="info" icon="repeat">
              By instalments
            </Chip>
          </div>
        </Cell>
      </Section>

      <Section
        title="Rows & cards"
        sub="One bill row and one document row, used everywhere."
        columns={2}
      >
        <Cell label="Bill row">
          <Rows>
            <BillRow bill={power} />
            <BillRow bill={rates} />
            <BillRow bill={gas} />
            <BillRow bill={rego} />
          </Rows>
        </Cell>
        <Cell label="Bill row inside a service">
          <Rows>
            {inService.map((b) => (
              <BillRow key={b.title} bill={b} />
            ))}
          </Rows>
        </Cell>
        <Cell label="Document row">
          <Rows>
            <DocRow
              doc={{
                href: '#',
                title: 'Your Origin bill is ready',
                sub: 'Bill · Forwarded by Jordan · 8 Sep',
                type: 'pdf',
                state: 'analysed',
                bill: 'Electricity · $486.21',
              }}
            />
            <DocRow
              doc={{
                href: '#',
                title: 'Rent statement October.pdf',
                sub: 'Bill · Uploaded by Alex · Today',
                type: 'pdf',
                state: 'analysed',
                needs: '1 detail to confirm',
              }}
            />
            <DocRow
              doc={{
                href: '#',
                title: 'IMG_4471.jpg',
                sub: 'Photo · Uploaded by Sam · Today',
                type: 'photo',
                state: 'waiting',
              }}
            />
            <DocRow
              doc={{
                href: '#',
                title: 'Payment received — thank you',
                sub: 'Receipt · Emailed in · 2 Sep',
                type: 'email',
                state: 'analysed',
              }}
            />
          </Rows>
        </Cell>
        <Cell label="Shares">
          <div className="shares">
            <ShareRow
              share={{
                member: alex,
                who: 'You',
                amount: '$162.07',
                state: { label: 'Pays Origin', tone: 'neutral', icon: 'arrow-right' },
              }}
            />
            <ShareRow
              share={{
                member: jordan,
                who: 'Jordan',
                amount: '$162.07',
                state: { label: 'Paid 10 Sep', tone: 'ok', icon: 'check' },
              }}
            />
            <ShareRow
              share={{
                member: sam,
                who: 'Sam',
                note: 'Moved in 1 Aug',
                amount: '$162.07',
                state: { label: 'Owes you', tone: 'warn', icon: 'clock' },
              }}
            />
          </div>
        </Cell>
        <Cell label="Files">
          <FileRow
            file={{
              type: 'pdf',
              name: 'Origin bill 8 Sep.pdf',
              sub: 'Forwarded by Jordan · 8 Sep · 2 pages',
              verified: 'originenergy.com.au',
            }}
          />
          <FileRow file={{ type: 'email', name: 'Payment receipt', sub: 'Emailed in · 12 Sep' }} />
          <FileRowManual title="Entered by hand" sub="Added by Alex · 8 Sep">
            <Button variant="ghost" size="sm" icon="upload">
              Attach file
            </Button>
          </FileRowManual>
        </Cell>
        <Cell label="Notices">
          <div className="grid gap-2">
            <Notice
              tone="warn"
              icon="trend-up"
              title="Electricity is 32% higher than last winter"
              body="Cold July and August. The usage charge is up; the supply charge hasn’t changed."
              href="#"
            />
            <Notice
              tone="info"
              icon="users"
              title="Who’s the car rego for?"
              body="Just you, or the household’s?"
              href="#"
              compact
            />
          </div>
        </Cell>
        <Cell label="Key–value and figures">
          <Kv
            rows={[
              [
                'Period',
                <span key="period">
                  Jun – Aug 2026 <span className="muted">· 92 days</span>
                </span>,
              ],
              ['Issued', '8 Sep 2026'],
              [
                'Invoice',
                <span key="inv" className="mono">
                  NW-4471-202609
                </span>,
              ],
            ]}
          />
          <div className="mt-4">
            <SectionHead
              title="From the bill"
              right={<span className="muted">vs last bill</span>}
            />
            <FigureRows
              same="same"
              pct={(f) => `${f > 0 ? '+' : '−'}${Math.round(Math.abs(f) * 100)}%`}
              rows={[
                { label: 'Usage', value: '1,684 kWh', amount: '$402.10', change: 0.11 },
                { label: 'Supply charge', value: '92 days', amount: '$84.11', change: 0 },
                { label: 'Solar credit', amount: '−$18.40', change: -0.2 },
                { label: 'Similar households', value: '15% less than you', comparison: true },
              ]}
            />
          </div>
        </Cell>
        <Cell label="Bills address">
          <AddressCard label="Forward bills to" address="riverside-k7x2p@brjlabs.com" />
        </Cell>
        <Cell label="Stats and comparisons">
          <Stats
            stats={[
              { label: 'Last financial year', value: '$1,842', sub: '4 bills' },
              { label: 'Average a month', value: '$154', sub: 'FY 2025–26' },
              { label: 'Latest bill', value: '$486.21', sub: 'Due tomorrow' },
              { label: 'Next bill', value: '≈ $455', sub: 'Early December' },
            ]}
          />
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
            <Delta dir="up">+11%</Delta>
            <Delta dir="down">−18%</Delta>
            <Delta dir="flat">Same</Delta>
            <Avatars members={[alex, jordan, sam]} />
            <Swatch colour={aqua} />
            <Swatch colour={magenta} dot />
          </div>
        </Cell>
      </Section>

      <Section
        title="Instruments"
        sub="Every tile carries one. One series per chart, hover for values."
      >
        <Cell label="Ring">
          <div className="grid place-items-center">
            <Ring pct={60} size={120}>
              <b>
                6<small>/10</small>
              </b>
            </Ring>
          </div>
        </Cell>
        <Cell label="Arc">
          <Arc pct={74} from={yellow} mark={80}>
            <b>18.3</b>
            <span>kWh a day</span>
          </Arc>
        </Cell>
        <Cell label="Sparkline">
          <div className="grid gap-3">
            <Sparkline values={monthly} height={44} />
            <Sparkline values={[7.1, 6.8, 7.4, 9.9, 12.1, 13.4]} colour={orange} height={44} />
          </div>
        </Cell>
        <Cell label="Stacked bar & progress">
          <div className="grid gap-3">
            <StackBar
              parts={[
                { value: 2300, colour: violet, label: 'Rent', text: '$2,300' },
                { value: 176, colour: aqua, label: 'Council rates', text: '$176' },
                { value: 173, colour: yellow, label: 'Electricity', text: '$173' },
                { value: 146, colour: orange, label: 'Gas', text: '$146' },
                { value: 101, colour: blue, label: 'Water', text: '$101' },
              ]}
            />
            <Progress value={0.62} />
            <Progress value={0.9} tone="warn" />
          </div>
        </Cell>
        <Cell label="Trend" span={2}>
          <div className="h-56">
            <TrendLine
              label="Monthly cost"
              points={monthly.map((v, i) => ({
                key: months[i]!,
                label: months[i]!,
                value: v,
                text: `$${v.toLocaleString('en-AU')}`,
              }))}
              axisFormat={(v) => `$${(v / 1000).toFixed(1)}k`}
            />
          </div>
        </Cell>
        <Cell label="Bills over time" span={2}>
          <div className="h-56">
            <PeriodBars
              label="Usage per day, each bill"
              colour={yellow}
              reference={{ value: 19.7, label: 'Your limit · 19.7 kWh/day' }}
              bars={[
                {
                  from: '2024-12-01',
                  to: '2025-02-28',
                  value: 14.9,
                  label: 'Dec',
                  tip: 'Dec – Feb · 14.9 kWh a day',
                  href: '#',
                },
                {
                  from: '2025-03-01',
                  to: '2025-05-31',
                  value: 15.4,
                  label: 'Mar',
                  tip: 'Mar – May · 15.4 kWh a day',
                  href: '#',
                },
                {
                  from: '2025-06-01',
                  to: '2025-08-31',
                  value: 17.4,
                  label: 'Jun',
                  tip: 'Jun – Aug · 17.4 kWh a day',
                  href: '#',
                },
                {
                  from: '2025-09-01',
                  to: '2025-11-30',
                  value: 13.8,
                  label: 'Sep',
                  tip: 'Sep – Nov · 13.8 kWh a day',
                  href: '#',
                },
                {
                  from: '2025-12-01',
                  to: '2026-02-28',
                  value: 14.3,
                  label: 'Dec',
                  tip: 'Dec – Feb · 14.3 kWh a day',
                  href: '#',
                },
                {
                  from: '2026-03-01',
                  to: '2026-05-31',
                  value: 16.4,
                  label: 'Mar',
                  tip: 'Mar – May · 16.4 kWh a day',
                  href: '#',
                },
                {
                  from: '2026-06-01',
                  to: '2026-08-31',
                  value: 18.3,
                  label: 'Jun',
                  tip: 'Jun – Aug · 18.3 kWh a day',
                  href: '#',
                  flag: true,
                },
              ]}
            />
          </div>
        </Cell>
        <Cell label="Forecast" span={2}>
          <div className="h-32">
            <ForecastPills
              showAll
              items={[
                { label: 'Oct', value: 2915, short: '$2.9k' },
                { label: 'Nov', value: 2880, short: '$2.9k' },
                { label: 'Dec', value: 2940, short: '$2.9k' },
                { label: 'Jan', value: 2990, short: '$3.0k' },
                { label: 'Feb', value: 2905, short: '$2.9k' },
                { label: 'Mar', value: 2915, short: '$2.9k' },
              ]}
            />
          </div>
        </Cell>
        <Cell label="Timeline" span={2}>
          <Timeline
            steps={[
              { title: 'Instalment 1', sub: 'Paid 12 Aug', amount: '$546.00', state: 'done' },
              { title: 'Instalment 2', sub: 'Due 30 Nov 2026', amount: '$546.00', state: 'next' },
              { title: 'Instalment 3', sub: 'Due 28 Feb 2027', amount: '$546.00', state: 'later' },
              { title: 'Instalment 4', sub: 'Due 31 May 2027', amount: '$546.00', state: 'later' },
            ]}
          />
        </Cell>
        <Cell label="Due dates" span={2}>
          <div className="h-52">
            <CalendarGrid days={days} weekdays={['M', 'T', 'W', 'T', 'F', 'S', 'S']} />
          </div>
        </Cell>
      </Section>

      <Section title="Surfaces" sub="Sheets and toasts." columns={2}>
        <Cell label="Sheet and toast">
          <SurfaceDemos />
        </Cell>
      </Section>
    </div>
  );
}
