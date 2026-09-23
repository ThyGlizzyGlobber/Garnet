import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

/**
 * Conventions:
 *  - ids are text ULIDs generated in app code (src/lib/ids.ts)
 *  - timestamps are ISO-8601 strings in UTC; calendar dates are YYYY-MM-DD
 *  - money is integer minor units + ISO 4217 currency code (src/lib/format.ts)
 *  - nothing country- or provider-specific lives here
 */

export const household = sqliteTable('household', {
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
  /** Template for payment references, e.g. "{service} {period} {member}". */
  paymentReferenceTemplate: text('payment_reference_template')
    .notNull()
    .default('{service} {period} {member}'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const member = sqliteTable(
  'member',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    pinHash: text('pin_hash').notNull(),
    role: text('role', { enum: ['owner', 'member'] })
      .notNull()
      .default('member'),
    /** Relative weight used when a service's split mode is "weighted". */
    splitWeight: real('split_weight').notNull().default(1),
    /** YYYY-MM-DD. Shares pro-rate by days active within a billing period. */
    activeFrom: text('active_from').notNull(),
    /** YYYY-MM-DD, null = still living here. */
    activeTo: text('active_to'),
    colour: text('colour').notNull().default('#0a84ff'),
    /** JSON array of {label, value}: PayID, BSB/account, IBAN, Venmo… */
    paymentDetails: text('payment_details', { mode: 'json' })
      .$type<{ label: string; value: string }[]>()
      .notNull()
      .default([]),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [uniqueIndex('member_name_unique').on(t.name)],
);

/** Editable catalog of service types. Seeded with the built-ins; households can add their own. */
export const serviceType = sqliteTable('service_type', {
  slug: text('slug').primaryKey(),
  label: text('label').notNull(),
  /** Canonical unit key from src/lib/units.ts, or null for services without usage. */
  defaultUnit: text('default_unit'),
  icon: text('icon').notNull().default('receipt'),
  sortOrder: integer('sort_order').notNull().default(100),
  isBuiltin: integer('is_builtin', { mode: 'boolean' }).notNull().default(false),
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

export const SPLIT_MODES = ['equal', 'weighted', 'custom'] as const;
export type SplitMode = (typeof SPLIT_MODES)[number];

export const service = sqliteTable(
  'service',
  {
    id: text('id').primaryKey(),
    typeSlug: text('type_slug')
      .notNull()
      .references(() => serviceType.slug),
    name: text('name').notNull(),
    provider: text('provider').notNull(),
    /** Customer/account number with the provider. */
    accountRef: text('account_ref'),
    cadence: text('cadence', { enum: CADENCES }).notNull().default('monthly'),
    usageUnit: text('usage_unit'),
    splitMode: text('split_mode', { enum: SPLIT_MODES }).notNull().default('equal'),
    /** Member who pays the provider; their own share is auto-marked paid. */
    payerMemberId: text('payer_member_id').references(() => member.id, { onDelete: 'set null' }),
    colour: text('colour').notNull().default('#0a84ff'),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    notes: text('notes'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [index('service_type_idx').on(t.typeSlug)],
);

/** Per-member weights, only consulted when service.splitMode === 'custom'. */
export const serviceSplit = sqliteTable(
  'service_split',
  {
    serviceId: text('service_id')
      .notNull()
      .references(() => service.id, { onDelete: 'cascade' }),
    memberId: text('member_id')
      .notNull()
      .references(() => member.id, { onDelete: 'cascade' }),
    weight: real('weight').notNull().default(1),
  },
  (t) => [uniqueIndex('service_split_unique').on(t.serviceId, t.memberId)],
);

export const DOCUMENT_STATUSES = ['unprocessed', 'extracted', 'needs_review', 'ignored'] as const;

/** A raw bill file archived under DATA_DIR/inbox — the permanent audit trail. */
export const sourceDocument = sqliteTable(
  'source_document',
  {
    id: text('id').primaryKey(),
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
    status: text('status', { enum: DOCUMENT_STATUSES }).notNull().default('unprocessed'),
    /** Raw extractor output kept for the review queue and re-parse. */
    extractionJson: text('extraction_json'),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('source_document_sha_unique').on(t.sha256),
    index('source_document_status_idx').on(t.status),
  ],
);

export const BILL_SOURCES = ['template', 'llm', 'manual'] as const;
export type BillSource = (typeof BILL_SOURCES)[number];

export const bill = sqliteTable(
  'bill',
  {
    id: text('id').primaryKey(),
    serviceId: text('service_id')
      .notNull()
      .references(() => service.id),
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
    source: text('source', { enum: BILL_SOURCES }).notNull(),
    extractor: text('extractor'),
    confidence: real('confidence'),
    /** Provider's invoice/reference number. Unique per service to block duplicate ingestion. */
    externalRef: text('external_ref'),
    paidToProviderAt: text('paid_to_provider_at'),
    isAnomaly: integer('is_anomaly', { mode: 'boolean' }).notNull().default(false),
    anomalyNote: text('anomaly_note'),
    notes: text('notes'),
    createdByMemberId: text('created_by_member_id').references(() => member.id, {
      onDelete: 'set null',
    }),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    uniqueIndex('bill_service_external_ref_unique').on(t.serviceId, t.externalRef),
    index('bill_period_idx').on(t.periodStart),
    index('bill_due_idx').on(t.dueDate),
  ],
);

export const share = sqliteTable(
  'share',
  {
    id: text('id').primaryKey(),
    billId: text('bill_id')
      .notNull()
      .references(() => bill.id, { onDelete: 'cascade' }),
    memberId: text('member_id')
      .notNull()
      .references(() => member.id),
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
    uniqueIndex('share_bill_member_unique').on(t.billId, t.memberId),
    index('share_member_idx').on(t.memberId),
  ],
);

export const projection = sqliteTable(
  'projection',
  {
    id: text('id').primaryKey(),
    serviceId: text('service_id')
      .notNull()
      .references(() => service.id, { onDelete: 'cascade' }),
    /** YYYY-MM in the household timezone. */
    periodMonth: text('period_month').notNull(),
    estimatedMinor: integer('estimated_minor').notNull(),
    currency: text('currency').notNull(),
    method: text('method').notNull(),
    inputsJson: text('inputs_json'),
    computedAt: text('computed_at').notNull(),
  },
  (t) => [uniqueIndex('projection_service_month_unique').on(t.serviceId, t.periodMonth)],
);

export type Household = typeof household.$inferSelect;
export type Member = typeof member.$inferSelect;
export type NewMember = typeof member.$inferInsert;
export type ServiceType = typeof serviceType.$inferSelect;
export type Service = typeof service.$inferSelect;
export type NewService = typeof service.$inferInsert;
export type ServiceSplit = typeof serviceSplit.$inferSelect;
export type SourceDocument = typeof sourceDocument.$inferSelect;
export type Bill = typeof bill.$inferSelect;
export type NewBill = typeof bill.$inferInsert;
export type Share = typeof share.$inferSelect;
export type Projection = typeof projection.$inferSelect;
