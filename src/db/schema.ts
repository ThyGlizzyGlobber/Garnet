import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Phase 0 ships only the household settings row so migrations, the client, and
 * the health check are wired end to end. Phase 1 adds Member, Service, Bill,
 * Share, Projection (SCOPE.md §8).
 *
 * Conventions:
 *  - ids are text (ULID-style, generated in app code)
 *  - timestamps are ISO-8601 strings in UTC
 *  - money is integer minor units + currency code (see src/lib/format.ts)
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
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export type Household = typeof household.$inferSelect;
export type NewHousehold = typeof household.$inferInsert;
