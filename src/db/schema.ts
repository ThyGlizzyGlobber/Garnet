import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

/**
 * Conventions:
 *  - ids are text ULIDs generated in app code (src/lib/ids.ts)
 *  - timestamps are ISO-8601 strings in UTC; calendar dates are YYYY-MM-DD
 *  - money is integer minor units + ISO 4217 currency code (src/lib/format.ts)
 *  - nothing country- or provider-specific lives here
 *  - every household-owned row carries household_id; all reads and writes are
 *    scoped to the signed-in member's household (src/lib/*)
 */

/** What kind of household (SCOPE-accounts.md §7). */
export const HOUSEHOLD_TYPES = ['own_home', 'investment_property', 'share_house'] as const;
/** How often a utilities allowance resets. */
export const ALLOWANCE_PERIODS = ['month', 'quarter', 'year'] as const;
/** Who someone is in a household; `owner` is the admin role. */
export const MEMBER_ROLES = ['owner', 'member', 'family', 'tenant', 'boarder'] as const;

export const household = sqliteTable(
  'household',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    /** ISO 4217, e.g. AUD, USD, EUR, GBP. */
    currency: text('currency').notNull(),
    /** BCP 47, e.g. en-AU, en-US, de-DE. Drives number/date formatting. */
    locale: text('locale').notNull(),
    /** IANA timezone, e.g. Australia/Melbourne. Drives "today", due dates, wall view. */
    timezone: text('timezone').notNull(),
    /** 1–12. Annual totals run from this month (7 = July–June financial year). */
    fiscalYearStartMonth: integer('fiscal_year_start_month').notNull().default(1),
    /** 0 = Sunday … 6 = Saturday. */
    weekStartsOn: integer('week_starts_on').notNull().default(1),
    /** shared = split bills between members; single = one household total, no shares. */
    splitMode: text('split_mode', { enum: ['shared', 'single'] })
      .notNull()
      .default('shared'),
    /**
     * What kind of household (SCOPE-accounts.md §7): an own home, an investment
     * property or a share house; null until an admin says (asked once on Home).
     * Decides which roles people can have and whether bills are split.
     */
    type: text('type', { enum: HOUSEHOLD_TYPES }),
    /** An investment property's address, as the landlord typed it (optional; shown to everyone in it). */
    address: text('address'),
    /**
     * A landlord's utilities allowance (SCOPE-accounts.md D17): utilities are
     * included in the rent up to this much per period; the overage is owed by
     * the tenants. Null = tenants pay their utilities directly (or not a let
     * property). Bills in an allowance household create no shares.
     */
    allowanceMinor: integer('allowance_minor'),
    allowancePeriod: text('allowance_period', { enum: ALLOWANCE_PERIODS })
      .notNull()
      .default('month'),
    /** AI reads a month for this household (SCOPE-console.md C-D4): null = the install's limit, 0 = no cap. */
    aiCap: integer('ai_cap'),
    /** The household's file key, wrapped with DATA_KEY (src/lib/crypto.ts); null while files are plain. */
    dataKey: text('data_key'),
    /** Template for payment references, e.g. "{service} {period} {member}". */
    paymentReferenceTemplate: text('payment_reference_template')
      .notNull()
      .default('{service} {period} {member}'),
    /**
     * Members (not just admins) may download the household's bills and files
     * (the zip export). Their own personal bills they can always download.
     */
    membersCanExport: integer('members_can_export', { mode: 'boolean' }).notNull().default(true),
    /** The fictional demo household; "Exit demo" deletes it. */
    isDemo: integer('is_demo', { mode: 'boolean' }).notNull().default(false),
    /**
     * The household's part of its bills email address (e.g. "smith-7k2f"), filled
     * in BILLS_ADDRESS_TEMPLATE. Created on first use; an admin can replace it.
     */
    billsAlias: text('bills_alias'),
    /**
     * Where the household is, to the postcode and never finer (scope S2):
     * seasons, hemisphere and (later) weather come from it. Country is ISO
     * 3166-1 alpha-2; latitude/longitude are the postcode's map point.
     */
    country: text('country'),
    postalCode: text('postal_code'),
    locality: text('locality'),
    region: text('region'),
    latitude: real('latitude'),
    longitude: real('longitude'),
    locationUpdatedAt: text('location_updated_at'),
    /**
     * Share anonymised figures with the area comparisons (scope S4). On by
     * default (owner decision); admins can turn it off in Settings. Every
     * change is recorded in household_consent.
     */
    shareRegional: integer('share_regional', { mode: 'boolean' }).notNull().default(true),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [uniqueIndex('household_bills_alias_unique').on(t.billsAlias)],
);

/** Light, dark, or auto (follow the device). */
export const THEMES = ['auto', 'light', 'dark'] as const;

/**
 * A person who can sign in (Google or an emailed one-time code). Accounts are
 * install-wide; a member row links an account into a household.
 */
export const account = sqliteTable(
  'account',
  {
    id: text('id').primaryKey(),
    /** Lower-cased. */
    email: text('email').notNull(),
    name: text('name').notNull(),
    /** Google's stable subject id, once the account has signed in with Google. */
    googleSub: text('google_sub'),
    /**
     * The person's PIN, set once, unlocking a trusted device for every household
     * they belong to (SCOPE-accounts.md D2). Nobody else can set or see it.
     */
    pinHash: text('pin_hash'),
    /** Light, dark or automatic, following the person to every device (D3). */
    theme: text('theme', { enum: THEMES }).notNull().default('auto'),
    /** The household they were last in, so a new device starts somewhere sensible (D6). */
    lastMemberId: text('last_member_id'),
    lastSignInAt: text('last_sign_in_at'),
    /**
     * When the person last set their profile photo (DATA_DIR/avatars/<id>.jpg);
     * null = none. Doubles as the photo's version in its URL.
     */
    avatarAt: text('avatar_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    uniqueIndex('account_email_unique').on(t.email),
    uniqueIndex('account_google_sub_unique').on(t.googleSub),
  ],
);

/** FK used by every household-owned table; deleting a household deletes its rows. */
const householdId = () =>
  text('household_id')
    .notNull()
    .references(() => household.id, { onDelete: 'cascade' });

export const member = sqliteTable(
  'member',
  {
    id: text('id').primaryKey(),
    householdId: householdId(),
    /** The signed-in person behind this member; null until an invite is accepted. */
    accountId: text('account_id').references(() => account.id, { onDelete: 'set null' }),
    /** Where the invite went. Contact only; sign-in identity lives on the account. */
    email: text('email'),
    name: text('name').notNull(),
    /** Demo households only: their pick-a-name sign-in checks this. Real accounts keep the PIN on the account. */
    pinHash: text('pin_hash'),
    /**
     * owner = an admin (shown as Admin, or Owner/Landlord in an investment
     * property); member = the generic housemate; family, tenant and boarder are
     * the housemate roles of a typed household. Only owner changes what someone may do.
     */
    role: text('role', { enum: MEMBER_ROLES }).notNull().default('member'),
    /** Relative weight used when a service's split mode is "weighted". */
    splitWeight: real('split_weight').notNull().default(1),
    /** YYYY-MM-DD. Shares pro-rate by days active within a billing period. */
    activeFrom: text('active_from').notNull(),
    /** YYYY-MM-DD, null = still living here. */
    activeTo: text('active_to'),
    colour: text('colour').notNull().default('#0a84ff'),
    /** Email me: new bills, due-date reminders, payment problems. */
    notifyBills: integer('notify_bills', { mode: 'boolean' }).notNull().default(true),
    notifyReminders: integer('notify_reminders', { mode: 'boolean' }).notNull().default(true),
    notifyProblems: integer('notify_problems', { mode: 'boolean' }).notNull().default(true),
    /** JSON array of {label, value}: PayID, BSB/account, IBAN, Venmo… */
    paymentDetails: text('payment_details', { mode: 'json' })
      .$type<{ label: string; value: string }[]>()
      .notNull()
      .default([]),
    /** The account's home of residence: first in the switcher, and where the app opens (D7). One per account. */
    isPrimary: integer('is_primary', { mode: 'boolean' }).notNull().default(false),
    /**
     * How this person arranged the services in the side menu (and so on the
     * Services page): JSON from src/lib/nav-layout.ts. Null = the default order.
     */
    navLayout: text('nav_layout'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    uniqueIndex('member_household_name_unique').on(t.householdId, t.name),
    uniqueIndex('member_household_account_unique').on(t.householdId, t.accountId),
    index('member_account_idx').on(t.accountId),
  ],
);

/** Catalog of service types, shared by every household (built-ins seeded by migration). */
export const serviceType = sqliteTable('service_type', {
  slug: text('slug').primaryKey(),
  label: text('label').notNull(),
  /** Canonical unit key from src/lib/units.ts, or null for services without usage. */
  defaultUnit: text('default_unit'),
  icon: text('icon').notNull().default('receipt'),
  sortOrder: integer('sort_order').notNull().default(100),
  isBuiltin: integer('is_builtin', { mode: 'boolean' }).notNull().default(false),
  /**
   * Usually one person's own, not the household's (car rego, car insurance): a
   * new service of this type set up from a member's upload or forward is
   * personal to that member.
   */
  personalByDefault: integer('personal_by_default', { mode: 'boolean' }).notNull().default(false),
  /** Group in pickers: see SERVICE_CATEGORIES (src/lib/service-categories.ts). */
  category: text('category').notNull().default('other'),
  /**
   * The colour every service of this type wears, in every household (a
   * palette colour, src/lib/palette.ts). Households don't pick service colours.
   */
  colour: text('colour').notNull().default('#e87ba4'),
  /**
   * A main service that holds sub-services (Subscriptions → Netflix, Spotify;
   * Donations → Red Cross): each provider is its own service of this type,
   * listed under the type in the nav and on the Services page.
   */
  hasSubServices: integer('has_sub_services', { mode: 'boolean' }).notNull().default(false),
});

export const CADENCES = [
  'weekly',
  'fortnightly',
  'monthly',
  'bimonthly',
  'quarterly',
  'annual',
  'irregular',
] as const;
export type Cadence = (typeof CADENCES)[number];

/**
 * How a household service's bills are split: equal, percent (service_split
 * weights are percentages), fixed (service_split amounts per bill; the rest
 * shared evenly). weighted (members' own split weights) is an older mode kept
 * for services that still use it; 0029 turned the old "custom" ratios into percent.
 */
export const SPLIT_MODES = ['equal', 'percent', 'fixed', 'weighted'] as const;
export type SplitMode = (typeof SPLIT_MODES)[number];

export const service = sqliteTable(
  'service',
  {
    id: text('id').primaryKey(),
    householdId: householdId(),
    typeSlug: text('type_slug')
      .notNull()
      .references(() => serviceType.slug),
    name: text('name').notNull(),
    provider: text('provider').notNull(),
    /** Customer/account number with the provider. */
    accountRef: text('account_ref'),
    cadence: text('cadence', { enum: CADENCES }).notNull().default('monthly'),
    usageUnit: text('usage_unit'),
    /** Household's own usage limit, per month, in usage_unit (e.g. 400 kWh). Compared per day. */
    usageLimitMonthly: real('usage_limit_monthly'),
    /**
     * Cost changes with the seasons (heating, cooling, solar): the Unusual flag
     * compares with the same time last year and allows for seasonal swings, and
     * season-ahead notices are shown. On by default for electricity and gas.
     */
    seasonal: integer('seasonal', { mode: 'boolean' }).notNull().default(false),
    splitMode: text('split_mode', { enum: SPLIT_MODES }).notNull().default('equal'),
    /** Members who pay no share of this service (boarders by default, D14): JSON array of member ids. */
    notSplitWith: text('not_split_with', { mode: 'json' }).$type<string[]>().notNull().default([]),
    /** Member who pays the provider; their own share is auto-marked paid. */
    payerMemberId: text('payer_member_id').references(() => member.id, { onDelete: 'set null' }),
    /**
     * Set when the service is one member's own (their car rego): only they see
     * it, it isn't split, and its bills stay out of every household figure.
     * Null = a household service. Bills carry a copy (bill.owner_member_id).
     */
    ownerMemberId: text('owner_member_id').references(() => member.id),
    /**
     * Services set up automatically from a bill: who brought that bill in, and
     * whether they've said if it's theirs or the household's. Until then the
     * app asks them (bill page, Home). Null = nobody needs asking.
     */
    setUpByMemberId: text('set_up_by_member_id').references(() => member.id, {
      onDelete: 'set null',
    }),
    ownerAskedAt: text('owner_asked_at'),
    ownerConfirmedAt: text('owner_confirmed_at'),
    /** Always its type's colour (service_type.colour), kept here for the queries that join it. */
    colour: text('colour').notNull().default('#0a84ff'),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    /**
     * A sub-service someone cancelled (Netflix): it stops being active, keeps
     * every bill, and a bill dated after this is flagged as charged after
     * cancelling. Null = not cancelled.
     */
    cancelledAt: text('cancelled_at'),
    /**
     * Recurring (a subscription, rent): the same charge is expected every
     * cadence at the latest bill's price, shown as upcoming, and recorded as
     * an assumed bill once its date passes with no bill in. When it was
     * switched on (ISO time); charges due before then are never assumed.
     * Null = not recurring.
     */
    recurringSince: text('recurring_since'),
    cancelledByMemberId: text('cancelled_by_member_id').references(() => member.id, {
      onDelete: 'set null',
    }),
    /**
     * The provider takes payment automatically (card on file, direct debit):
     * bills count as paid to the provider once the due date passes, unless a
     * payment problem is reported. Learned from invoices; editable.
     */
    autoPay: integer('auto_pay', { mode: 'boolean' }).notNull().default(false),
    /**
     * Email domains whose signed bills may become bills automatically, e.g.
     * ["aussiebroadband.com.au"]. Learned from the review queue; editable.
     */
    trustedSenders: text('trusted_senders', { mode: 'json' })
      .$type<string[]>()
      .notNull()
      .default([]),
    notes: text('notes'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    index('service_type_idx').on(t.typeSlug),
    index('service_household_idx').on(t.householdId),
    index('service_owner_idx').on(t.ownerMemberId),
  ],
);

/** Per-member split: percentages ('percent') or amounts per bill ('fixed'). */
export const serviceSplit = sqliteTable(
  'service_split',
  {
    householdId: householdId(),
    serviceId: text('service_id')
      .notNull()
      .references(() => service.id, { onDelete: 'cascade' }),
    memberId: text('member_id')
      .notNull()
      .references(() => member.id, { onDelete: 'cascade' }),
    weight: real('weight').notNull().default(1),
    /** 'fixed': what this member pays of each bill, in minor units (0 = nothing). */
    amountMinor: integer('amount_minor'),
  },
  (t) => [uniqueIndex('service_split_unique').on(t.serviceId, t.memberId)],
);

/**
 * notice = a provider email that isn't a bill (payment failed/received, password
 * reset, plan change…): kept, but not in the review queue.
 */
export const DOCUMENT_STATUSES = [
  'unprocessed',
  'extracted',
  'needs_review',
  'ignored',
  'notice',
] as const;

/** A raw bill file archived under DATA_DIR/inbox — the permanent audit trail. */
export const sourceDocument = sqliteTable(
  'source_document',
  {
    id: text('id').primaryKey(),
    householdId: householdId(),
    kind: text('kind', { enum: ['email', 'pdf', 'upload'] }).notNull(),
    /** Path relative to DATA_DIR/inbox. */
    path: text('path').notNull(),
    originalFilename: text('original_filename'),
    mimeType: text('mime_type'),
    sha256: text('sha256').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    receivedAt: text('received_at').notNull(),
    emailFrom: text('email_from'),
    emailSubject: text('email_subject'),
    emailMessageId: text('email_message_id'),
    /** From-address domain for mail that arrived at a household bills address; null otherwise. */
    senderDomain: text('sender_domain'),
    /** A valid DKIM signature aligned with the From domain (checked by the app). */
    senderVerified: integer('sender_verified', { mode: 'boolean' }),
    /** The member who uploaded it or forwarded it from their own address, when known. */
    memberId: text('member_id').references(() => member.id, { onDelete: 'set null' }),
    status: text('status', { enum: DOCUMENT_STATUSES }).notNull().default('unprocessed'),
    /** Raw extractor output kept for the review queue and re-parse. */
    extractionJson: text('extraction_json'),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('source_document_household_sha_unique').on(t.householdId, t.sha256),
    index('source_document_status_idx').on(t.status),
  ],
);

/**
 * A vehicle the household pays several kinds of bills for (its rego,
 * insurance, roadside cover, servicing). Entered once; the bills of the
 * Vehicles services are filed under it (bill.asset_id). Household or one
 * member's own, like a service: a personal one is seen only by that member,
 * and its bills are that member's personal bills. (kind stays a column so
 * other kinds of things can join later.)
 */
export const ASSET_KINDS = ['vehicle'] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export const asset = sqliteTable(
  'asset',
  {
    id: text('id').primaryKey(),
    householdId: householdId(),
    kind: text('kind', { enum: ASSET_KINDS }).notNull(),
    /** What the household calls it: "Ford Fiesta 2011". */
    name: text('name').notNull(),
    /** As entered: a number plate or VIN. */
    identifier: text('identifier'),
    /** The identifier in capitals without spaces or punctuation, for matching bills. */
    identifierKey: text('identifier_key'),
    /** Null = the household's; else only this member sees it and its bills. */
    ownerMemberId: text('owner_member_id').references(() => member.id),
    createdByMemberId: text('created_by_member_id').references(() => member.id, {
      onDelete: 'set null',
    }),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    index('asset_household_idx').on(t.householdId),
    index('asset_identifier_idx').on(t.householdId, t.identifierKey),
  ],
);

/** recurring: an assumed charge of a recurring service (src/lib/recurring.ts). */
export const BILL_SOURCES = ['template', 'llm', 'manual', 'recurring'] as const;
export type BillSource = (typeof BILL_SOURCES)[number];

export const bill = sqliteTable(
  'bill',
  {
    id: text('id').primaryKey(),
    householdId: householdId(),
    serviceId: text('service_id')
      .notNull()
      .references(() => service.id),
    /** Copy of the service's owner: a personal bill, seen only by that member. */
    ownerMemberId: text('owner_member_id').references(() => member.id),
    sourceDocumentId: text('source_document_id').references(() => sourceDocument.id),
    amountMinor: integer('amount_minor').notNull(),
    currency: text('currency').notNull(),
    taxMinor: integer('tax_minor'),
    taxLabel: text('tax_label'),
    periodStart: text('period_start').notNull(),
    periodEnd: text('period_end').notNull(),
    issueDate: text('issue_date'),
    dueDate: text('due_date').notNull(),
    usageQuantity: real('usage_quantity'),
    usageUnit: text('usage_unit'),
    /** When the AI last listed this bill's figures (bill_metric), even if it found none. */
    metricsReadAt: text('metrics_read_at'),
    /**
     * Weather over the bill's period at the household's postcode (scope S3):
     * heating/cooling degree-days and solar energy (MJ/m²), summed over the
     * period. Filled once every day of the period has weather.
     */
    hdd: real('hdd'),
    cdd: real('cdd'),
    solarMj: real('solar_mj'),
    weatherFilledAt: text('weather_filled_at'),
    source: text('source', { enum: BILL_SOURCES }).notNull(),
    extractor: text('extractor'),
    confidence: real('confidence'),
    /** Provider's invoice/reference number. Unique per service to block duplicate ingestion. */
    externalRef: text('external_ref'),
    paidToProviderAt: text('paid_to_provider_at'),
    isAnomaly: integer('is_anomaly', { mode: 'boolean' }).notNull().default(false),
    /** Set from a provider email: the payment for this bill failed or it's overdue. */
    alertKind: text('alert_kind', { enum: ['payment_failed', 'overdue'] }),
    alertAt: text('alert_at'),
    /** The provider email that raised the alert. */
    alertDocumentId: text('alert_document_id').references(() => sourceDocument.id, {
      onDelete: 'set null',
    }),
    anomalyNote: text('anomaly_note'),
    /** What the Unusual check compared with: last_year | recent | seasonal_allowance. */
    anomalyBasis: text('anomaly_basis', { enum: ['last_year', 'recent', 'seasonal_allowance'] }),
    /**
     * Bills that offer instalments (council rates, rego, insurance): the "pay in
     * full" option, kept so the household can switch back from instalments.
     * Null when the bill offers no instalments (bill_instalment has no rows).
     */
    fullAmountMinor: integer('full_amount_minor'),
    fullDueDate: text('full_due_date'),
    /**
     * How the household pays a bill that offers instalments: null = not chosen
     * yet (treated as in full), full, or instalments. With instalments,
     * amount_minor is their sum and due_date the next unpaid instalment's.
     */
    paymentPlan: text('payment_plan', { enum: ['full', 'instalments'] }),
    /**
     * Recorded by the app for a recurring service because its date passed with
     * no bill in (src/lib/recurring.ts). The real bill, when it comes, takes
     * its place and clears this.
     */
    assumed: integer('assumed', { mode: 'boolean' }).notNull().default(false),
    /** The vehicle it's for (bills of the Vehicles services). */
    assetId: text('asset_id').references(() => asset.id, { onDelete: 'set null' }),
    /**
     * Identifiers printed on the bill (number plates, VINs), as matching
     * keys (see identifierKey), for filing it under a vehicle added later.
     */
    assetRefs: text('asset_refs', { mode: 'json' }).$type<string[]>(),
    notes: text('notes'),
    createdByMemberId: text('created_by_member_id').references(() => member.id, {
      onDelete: 'set null',
    }),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    uniqueIndex('bill_service_external_ref_unique').on(t.serviceId, t.externalRef),
    index('bill_household_idx').on(t.householdId),
    index('bill_period_idx').on(t.periodStart),
    index('bill_due_idx').on(t.dueDate),
    index('bill_owner_idx').on(t.ownerMemberId),
    // The Inbox and document clean-ups look bills up by the file they came from.
    index('bill_source_document_idx').on(t.sourceDocumentId),
    index('bill_alert_document_idx').on(t.alertDocumentId),
    index('bill_asset_idx').on(t.assetId),
  ],
);

/** An instalment a bill offers ("1st instalment $918.00 due 30/09/2026"), in order. */
export const billInstalment = sqliteTable(
  'bill_instalment',
  {
    id: text('id').primaryKey(),
    householdId: householdId(),
    billId: text('bill_id')
      .notNull()
      .references(() => bill.id, { onDelete: 'cascade' }),
    /** 1-based position on the bill. */
    seq: integer('seq').notNull(),
    dueDate: text('due_date').notNull(),
    amountMinor: integer('amount_minor').notNull(),
    /** Only used while the household pays this bill by instalments. */
    paidToProviderAt: text('paid_to_provider_at'),
  },
  (t) => [
    uniqueIndex('bill_instalment_bill_seq_unique').on(t.billId, t.seq),
    index('bill_instalment_household_idx').on(t.householdId),
  ],
);

export const share = sqliteTable(
  'share',
  {
    id: text('id').primaryKey(),
    householdId: householdId(),
    billId: text('bill_id')
      .notNull()
      .references(() => bill.id, { onDelete: 'cascade' }),
    memberId: text('member_id')
      .notNull()
      .references(() => member.id),
    /** 0 = the whole bill; 1…n = that instalment, when the bill is paid by instalments. */
    instalment: integer('instalment').notNull().default(0),
    /** The instalment's due date; null = the bill's due date. */
    dueDate: text('due_date'),
    amountMinor: integer('amount_minor').notNull(),
    currency: text('currency').notNull(),
    /** How the split was derived, kept for transparency in the UI. */
    basisWeight: real('basis_weight').notNull(),
    basisDays: integer('basis_days').notNull(),
    periodDays: integer('period_days').notNull(),
    paidAt: text('paid_at'),
    /** payer = this member paid the provider directly; transfer/cash/other = paid the payer back. */
    paidMethod: text('paid_method'),
    paymentReference: text('payment_reference'),
    markedByMemberId: text('marked_by_member_id').references(() => member.id, {
      onDelete: 'set null',
    }),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    uniqueIndex('share_bill_member_unique').on(t.billId, t.memberId, t.instalment),
    index('share_member_idx').on(t.memberId),
    index('share_household_idx').on(t.householdId),
  ],
);

/**
 * An invitation for one member row. The link token and the short typed code are
 * both stored hashed; either one accepts the invite, once, before it expires.
 */
export const invite = sqliteTable(
  'invite',
  {
    id: text('id').primaryKey(),
    householdId: householdId(),
    memberId: text('member_id')
      .notNull()
      .references(() => member.id, { onDelete: 'cascade' }),
    email: text('email'),
    tokenHash: text('token_hash').notNull(),
    codeHash: text('code_hash').notNull(),
    createdByMemberId: text('created_by_member_id').references(() => member.id, {
      onDelete: 'set null',
    }),
    expiresAt: text('expires_at').notNull(),
    acceptedAt: text('accepted_at'),
    acceptedByAccountId: text('accepted_by_account_id').references(() => account.id, {
      onDelete: 'set null',
    }),
    revokedAt: text('revoked_at'),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('invite_token_unique').on(t.tokenHash),
    uniqueIndex('invite_code_unique').on(t.codeHash),
    index('invite_member_idx').on(t.memberId),
  ],
);

/** Emailed one-time sign-in codes (hashed). */
export const loginCode = sqliteTable(
  'login_code',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    codeHash: text('code_hash').notNull(),
    attempts: integer('attempts').notNull().default(0),
    expiresAt: text('expires_at').notNull(),
    consumedAt: text('consumed_at'),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('login_code_email_idx').on(t.email)],
);

/**
 * A browser an account has fully signed in on. The member's PIN only unlocks a
 * trusted device; too many wrong PINs deletes the row and forces a full sign-in.
 */
export const device = sqliteTable(
  'device',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id')
      .notNull()
      .references(() => account.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    label: text('label'),
    pinFailures: integer('pin_failures').notNull().default(0),
    createdAt: text('created_at').notNull(),
    lastSeenAt: text('last_seen_at').notNull(),
    expiresAt: text('expires_at').notNull(),
  },
  (t) => [
    uniqueIndex('device_token_unique').on(t.tokenHash),
    index('device_account_idx').on(t.accountId),
  ],
);

/** Metered actions per household per calendar month (UTC), e.g. AI bill reads. */
export const usage = sqliteTable(
  'usage',
  {
    householdId: householdId(),
    /** YYYY-MM, UTC. */
    month: text('month').notNull(),
    kind: text('kind').notNull(),
    count: integer('count').notNull().default(0),
  },
  (t) => [uniqueIndex('usage_household_month_kind_unique').on(t.householdId, t.month, t.kind)],
);

export const METRIC_KINDS = [
  'usage',
  'reading',
  'charge',
  'rate',
  'average',
  'comparison',
  'other',
] as const;
export type MetricKind = (typeof METRIC_KINDS)[number];

/**
 * Every figure the AI reader found on a bill (usage by tariff, meter readings,
 * charges, rates, daily averages, comparisons…), kept for later features.
 * `key` is a stable snake_case name so the same figure lines up across bills and
 * providers. Quantities and rates use value + unit (rates as major currency per
 * unit, e.g. 0.2953 "AUD/kWh"); money amounts use amount_minor + currency.
 */
export const billMetric = sqliteTable(
  'bill_metric',
  {
    id: text('id').primaryKey(),
    householdId: householdId(),
    billId: text('bill_id')
      .notNull()
      .references(() => bill.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    label: text('label').notNull(),
    kind: text('kind', { enum: METRIC_KINDS }).notNull(),
    value: real('value'),
    unit: text('unit'),
    amountMinor: integer('amount_minor'),
    currency: text('currency'),
    periodStart: text('period_start'),
    periodEnd: text('period_end'),
    position: integer('position').notNull().default(0),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    index('bill_metric_bill_idx').on(t.billId),
    index('bill_metric_household_key_idx').on(t.householdId, t.key),
  ],
);

/**
 * Daily weather per map square (latitude/longitude rounded to 0.1°), shared by
 * every household in it. Not personal data. `source` says which API filled it
 * (the archive is final; forecast-API "past days" fill the last few days until
 * the archive has them).
 */
export const weatherDay = sqliteTable(
  'weather_day',
  {
    cell: text('cell').notNull(),
    date: text('date').notNull(),
    tempMean: real('temp_mean'),
    tempMin: real('temp_min'),
    tempMax: real('temp_max'),
    /** Shortwave radiation, MJ/m² for the day. */
    radiation: real('radiation'),
    /** Hours of sunshine. */
    sunshine: real('sunshine'),
    /** WMO weather code. */
    code: integer('code'),
    source: text('source', { enum: ['archive', 'recent'] }).notNull(),
    fetchedAt: text('fetched_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.cell, t.date] })],
);

/** The next days' forecast per map square, replaced on each refresh. */
export const weatherForecast = sqliteTable(
  'weather_forecast',
  {
    cell: text('cell').notNull(),
    date: text('date').notNull(),
    tempMean: real('temp_mean'),
    tempMin: real('temp_min'),
    tempMax: real('temp_max'),
    radiation: real('radiation'),
    sunshine: real('sunshine'),
    code: integer('code'),
    rainChance: integer('rain_chance'),
    fetchedAt: text('fetched_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.cell, t.date] })],
);

/** Each change to a household's data-sharing choice, with who made it and under which notice. */
export const householdConsent = sqliteTable(
  'household_consent',
  {
    id: text('id').primaryKey(),
    householdId: householdId(),
    kind: text('kind', { enum: ['regional'] }).notNull(),
    granted: integer('granted', { mode: 'boolean' }).notNull(),
    /** How it was given: the default at setup, acknowledged later, or changed in Settings. */
    how: text('how', { enum: ['default', 'acknowledged', 'settings'] }).notNull(),
    /** Version of the privacy notice shown at the time. */
    noticeVersion: text('notice_version').notNull(),
    byMemberId: text('by_member_id').references(() => member.id, { onDelete: 'set null' }),
    at: text('at').notNull(),
  },
  (t) => [index('household_consent_household_idx').on(t.householdId, t.kind)],
);

/**
 * Area figures (scope S4): medians and quartiles across sharing households,
 * written only when at least REGIONAL_MIN_HOUSEHOLDS households stand behind
 * them. No household ids: nothing here can be traced back to one home.
 * Recomputed in full by the worker.
 */
export const regionalStat = sqliteTable(
  'regional_stat',
  {
    level: text('level', { enum: ['postcode', 'region', 'state', 'country'] }).notNull(),
    area: text('area').notNull(),
    serviceType: text('service_type').notNull(),
    month: text('month').notNull(),
    /** Household size band: all | 1 | 2 | 3-4 | 5+. */
    sizeBand: text('size_band').notNull(),
    metric: text('metric').notNull(),
    /** Unit of the values: a currency (minor units per day), a usage unit per day, or currency/unit. */
    unit: text('unit').notNull(),
    households: integer('households').notNull(),
    median: real('median').notNull(),
    p25: real('p25').notNull(),
    p75: real('p75').notNull(),
    computedAt: text('computed_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.level, t.area, t.serviceType, t.month, t.sizeBand, t.metric] })],
);

/** One row per email sent about something, so nothing is sent twice. */
export const notificationLog = sqliteTable(
  'notification_log',
  {
    id: text('id').primaryKey(),
    householdId: householdId(),
    memberId: text('member_id')
      .notNull()
      .references(() => member.id, { onDelete: 'cascade' }),
    /** e.g. new_bill, share_due, share_overdue:1, provider_due, payment_failed. */
    kind: text('kind').notNull(),
    /** The bill or share it was about. */
    refId: text('ref_id').notNull(),
    sentAt: text('sent_at').notNull(),
  },
  (t) => [uniqueIndex('notification_once').on(t.memberId, t.kind, t.refId)],
);

export type Household = typeof household.$inferSelect;
export type Account = typeof account.$inferSelect;
export type Invite = typeof invite.$inferSelect;
export type Device = typeof device.$inferSelect;
export type Member = typeof member.$inferSelect;
export type NewMember = typeof member.$inferInsert;
export type ServiceType = typeof serviceType.$inferSelect;
export type Service = typeof service.$inferSelect;
export type NewService = typeof service.$inferInsert;
export type ServiceSplit = typeof serviceSplit.$inferSelect;
export type SourceDocument = typeof sourceDocument.$inferSelect;
export type Bill = typeof bill.$inferSelect;
export type Asset = typeof asset.$inferSelect;
export type BillMetric = typeof billMetric.$inferSelect;
export type WeatherDay = typeof weatherDay.$inferSelect;
export type WeatherForecast = typeof weatherForecast.$inferSelect;
export type NewBill = typeof bill.$inferInsert;
export type Share = typeof share.$inferSelect;
export type BillInstalment = typeof billInstalment.$inferSelect;

/**
 * A person's Home layout for one kind of screen (desktop, iPad landscape or
 * portrait, phone), and their wall's: the grid density and the widgets on
 * each page, in order (packing decides where each lands). Missing = the
 * default layout (src/lib/home-grid.ts).
 */
export const homeLayout = sqliteTable(
  'home_layout',
  {
    id: text('id').primaryKey(),
    householdId: householdId(),
    memberId: text('member_id')
      .notNull()
      .references(() => member.id, { onDelete: 'cascade' }),
    device: text('device', { enum: ['desktop', 'tabletL', 'tabletP', 'phone'] }).notNull(),
    kind: text('kind', { enum: ['home', 'wall'] })
      .notNull()
      .default('home'),
    density: text('density', { enum: ['comfy', 'standard', 'dense'] })
      .notNull()
      .default('standard'),
    /** JSON: pages of {id, w, h}. */
    pages: text('pages', { mode: 'json' })
      .$type<{ id: string; w: number; h: number }[][]>()
      .notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [uniqueIndex('home_layout_member_device_kind').on(t.memberId, t.device, t.kind)],
);
export type HomeLayout = typeof homeLayout.$inferSelect;

/**
 * Early access (SCOPE-console.md §4): while it is on, only these addresses
 * and invited people may create an account. Single emails, lower-cased.
 */
export const allowedSignup = sqliteTable('allowed_signup', {
  email: text('email').primaryKey(),
  note: text('note'),
  addedByAccountId: text('added_by_account_id'),
  addedAt: text('added_at').notNull(),
  /** When an account was first created with this address. */
  usedAt: text('used_at'),
});

/** Someone asking to be let in from the sign-in page; decided from the console. */
export const accessRequest = sqliteTable(
  'access_request',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    message: text('message'),
    createdAt: text('created_at').notNull(),
    decidedAt: text('decided_at'),
    decidedByAccountId: text('decided_by_account_id'),
    outcome: text('outcome', { enum: ['approved', 'declined'] }),
  },
  (t) => [index('access_request_email_idx').on(t.email)],
);

/** Install-wide settings changed from the console (early access on/off, and later more). */
export const installSetting = sqliteTable('install_setting', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull(),
});
export type AllowedSignup = typeof allowedSignup.$inferSelect;
export type AccessRequest = typeof accessRequest.$inferSelect;

/** What developers did on the install (SCOPE-console.md §3f): kept for good, never deleted from the app. */
export const auditLog = sqliteTable(
  'audit_log',
  {
    id: text('id').primaryKey(),
    at: text('at').notNull(),
    accountId: text('account_id'),
    email: text('email'),
    action: text('action').notNull(),
    targetKind: text('target_kind'),
    targetId: text('target_id'),
    targetName: text('target_name'),
    detail: text('detail', { mode: 'json' }).$type<
      Record<string, string | number | boolean | null>
    >(),
    ip: text('ip'),
  },
  (t) => [index('audit_log_at_idx').on(t.at)],
);
export type AuditLog = typeof auditLog.$inferSelect;
