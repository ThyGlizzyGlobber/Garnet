import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type {
  DocumentBlockParam,
  ImageBlockParam,
} from '@anthropic-ai/sdk/resources/messages/messages';
import { z } from 'zod';
import { isIsoDate } from '@/lib/dates';
import { getEnv } from '@/lib/env';
import { minorUnitDigits } from '@/lib/format';
import { listUnits } from '@/lib/units';
import type {
  BillInstalmentOption,
  DocumentKind,
  ExtractedBill,
  ExtractionResult,
  Extractor,
  ScanFile,
} from '../types';

/**
 * Dates are plain strings in the schema and checked in toResult(): a regex
 * pattern per date field made the compiled output grammar too large for the
 * API ("The compiled grammar is too large…"), failing every document.
 */
const isoDate = z.string();

/** Exported for tests (the schema must stay small enough for structured outputs). */
export const outputSchema = z.object({
  document_type: z
    .enum([
      'bill',
      'payment_receipt',
      'payment_failed',
      'overdue_notice',
      'payment_received',
      'other',
    ])
    .describe(
      'bill = an invoice/bill asking for payment; payment_receipt = a receipt confirming a payment was taken (often names the invoices it paid); payment_failed = a payment, direct debit or card charge was declined/dishonoured/unsuccessful; overdue_notice = a reminder that a bill is overdue or unpaid; payment_received = a short "thanks for your payment" confirmation without receipt details; other = anything else (password resets, plan changes, marketing, welcome emails)',
    ),
  provider: z.string().nullable().describe('Company that sent the document, as printed'),
  document_date: isoDate
    .nullable()
    .describe(
      'The date printed on the document (issue date of a bill, date of a receipt or notice). For a forwarded email, the ORIGINAL message’s date, never the forward’s. Null if none is shown.',
    ),
  service_type: z.string().nullable().describe('One of the household service types, or "other"'),
  bill: z
    .object({
      amount: z
        .number()
        .describe(
          'Total amount due for THIS bill, in major units (e.g. 129.00); for a bill offering instalments, the amount to pay in full',
        ),
      currency: z.string().describe('ISO 4217 code, e.g. AUD, USD, EUR'),
      tax_amount: z.number().nullable().describe('Tax included in the amount, if stated'),
      tax_label: z.string().nullable().describe('GST, VAT, sales tax, etc.'),
      period_start: isoDate.describe('First day of the billing period, YYYY-MM-DD'),
      period_end: isoDate.describe('Last day of the billing period, YYYY-MM-DD'),
      issue_date: isoDate.nullable(),
      due_date: isoDate.describe(
        'Payment due or direct-debit date, YYYY-MM-DD; for a bill offering instalments, the date to pay in full by',
      ),
      usage_quantity: z.number().nullable().describe('Metered usage for the period, if any'),
      usage_unit: z.string().nullable().describe('Unit key for the usage, from the allowed list'),
      invoice_number: z.string().nullable(),
      account_number: z.string().nullable(),
      auto_pay: z
        .boolean()
        .nullable()
        .describe(
          'True if the bill says it will be paid automatically (direct debit, card on file, auto-pay); false if the customer must pay it; null if not stated',
        ),
      previous_payment: z
        .object({
          due_date: isoDate.describe('Due date of the PREVIOUS bill'),
          amount_due: z.number(),
          amount_received: z.number(),
        })
        .nullable()
        .describe(
          'If the bill shows what happened to the previous bill (e.g. "Last month: $129 due, $129 received"), else null',
        ),
      metrics: z
        .array(
          z.object({
            key: z
              .string()
              .describe(
                'Stable snake_case name, from the vocabulary in the instructions when one fits',
              ),
            label: z.string().describe('The figure’s name as printed on the bill'),
            kind: z.enum(['usage', 'reading', 'charge', 'rate', 'average', 'comparison', 'other']),
            value: z
              .number()
              .nullable()
              .describe('For quantities, readings, averages and rates; null for money amounts'),
            unit: z
              .string()
              .nullable()
              .describe(
                'Unit of value: an allowed unit key when one fits (kWh, MJ, kL, GB…), else as printed (days, kW, kg CO2e, minutes); for rates CURRENCY/unit, e.g. AUD/kWh, AUD/day',
              ),
            amount: z
              .number()
              .nullable()
              .describe(
                'For money amounts (charges, credits, discounts), in major units; negative for credits and discounts; null otherwise',
              ),
            period_start: isoDate
              .nullable()
              .describe('Only if this figure covers part of the bill period'),
            period_end: isoDate.nullable(),
          }),
        )
        .describe('Every other figure printed on the bill; empty if there are none'),
      instalments: z
        .array(
          z.object({
            due_date: isoDate.describe('YYYY-MM-DD'),
            amount: z.number().describe('Major units'),
          }),
        )
        .nullable()
        .describe(
          'If the bill offers paying in instalments, every instalment in order (e.g. 4 quarterly instalments); null if it offers none',
        ),
    })
    .nullable()
    .describe('Required when document_type is bill; null otherwise'),
  payment: z
    .object({
      date: isoDate.nullable().describe('Date the payment was made, attempted or confirmed'),
      amount: z.number().nullable(),
      currency: z.string().nullable(),
      invoice_numbers: z
        .array(z.string())
        .describe('Invoice/bill numbers this payment was for, exactly as printed; empty if none'),
    })
    .nullable()
    .describe('For receipts and payment notices; null for bills and other documents'),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe('Your confidence that document_type and every field you filled in are correct'),
  notes: z
    .string()
    .nullable()
    .describe('Anything ambiguous, e.g. multiple amounts or an estimated read'),
});

const SYSTEM = `You read one document sent to a household's bills inbox and return a structured record.
First decide what the document is (document_type), then fill in the matching part: "bill" for bills, "payment" for receipts and payment notices. Leave the other part null.
Rules for bills:
- amount is the total the customer must pay for THIS bill (not the account balance, not previous payments, not usage charges before tax).
- If the bill covers a period, period_start and period_end are the first and last days inclusive. If only an issue date is given for a monthly service, use a one-month period starting on the issue date.
- Map usage to the closest unit key from the allowed list (e.g. MJ for gas megajoules, kWh for electricity, kL or m3 for water). Use null if there is no metered usage.
- Choose service_type from the household's list. Use "other" if none fit. council_rates is council, shire or municipal rates (property rates notices); strata is strata, body corporate or owners corporation levies; vehicle_registration is car, motorbike or trailer registration; subscriptions is streaming, software and other memberships; phone is mobile or landline phone plans.
- metrics: list EVERY figure printed on the bill besides the amount due, so the household can track them over time. That includes usage split by tariff or time band (peak, off-peak, shoulder, controlled load), solar export, meter readings (start/end, estimated or actual), days in the period, daily averages (usage and cost), comparisons (previous period, same period last year, similar households), each charge and credit line (supply/service/fixed charges, usage charges, discounts, concessions, fees, feed-in credits), each rate or tariff, emissions, data used and allowance, call/SMS counts, water by category, sewage and drainage charges, and anything else numeric. One entry per figure; convert rates printed in cents to major units (29.53 c/kWh → value 0.2953, unit AUD/kWh). Use these keys when they fit, otherwise invent one in the same style: usage_total, usage_peak, usage_off_peak, usage_shoulder, usage_controlled_load, solar_export, meter_read_start, meter_read_end, days_in_period, daily_average_usage, daily_average_cost, previous_period_usage, previous_period_cost, same_period_last_year_usage, similar_households_usage, supply_charge, usage_charge, usage_charge_peak, usage_charge_off_peak, controlled_load_charge, discount, concession, late_fee, feed_in_credit, rate_supply, rate_peak, rate_off_peak, rate_shoulder, rate_controlled_load, rate_feed_in, greenhouse_emissions, data_used, data_allowance, calls, water_usage, sewage_charge, water_service_charge, drainage_charge, subtotal_before_tax.
- instalments: some bills (council rates, water, vehicle registration, insurance) let the customer choose between paying in full and paying in instalments. List every instalment with its own due date and amount exactly as printed (one is often a few cents different); amount and due_date are then the pay-in-full option. If the bill prints only instalments, amount is their total and due_date the first instalment's date. A separate reminder for one instalment of a notice already issued (e.g. "2nd instalment due 30 November") is not a new bill: use document_type other and say so in notes.
Rules for everything:
- Dates are ISO YYYY-MM-DD. If the text prints dates numerically, use the locale hint to decide day/month order.
- A receipt or "your payment was successful" email is never a bill, even though it shows an amount.
- Conditional wording on a bill ("if your payment fails, a fee applies") does not make it a payment_failed notice.
- Lower your confidence when amounts conflict, text is garbled, or fields are inferred rather than read.`;

let client: Anthropic | undefined;

/**
 * One AI read at a time across the process: a forward carrying a dozen PDFs is
 * read document by document, never as a burst the API refuses.
 */
const MAX_PARALLEL = 1;
let running = 0;
const waiting: (() => void)[] = [];
async function oneAtATime<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= MAX_PARALLEL) await new Promise<void>((go) => waiting.push(go));
  running++;
  try {
    return await fn();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

/** A scan or photo as a content block (the file itself goes before the instructions). */
function fileBlock(file: ScanFile): DocumentBlockParam | ImageBlockParam {
  const data = file.data.toString('base64');
  return file.mediaType === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
    : { type: 'image', source: { type: 'base64', media_type: file.mediaType, data } };
}

/** The API refused the output schema as too large or complex to compile. */
export function isSchemaTooLarge(e: unknown): boolean {
  return /grammar is too large|schema is too (large|complex)|too many strict/i.test(
    e instanceof Error ? e.message : String(e),
  );
}

let schemaText: string | undefined;
function jsonInstruction(): string {
  schemaText ??= JSON.stringify(z.toJSONSchema(outputSchema));
  return `Reply with exactly one JSON object and nothing else (no prose, no code fence). It must match this JSON Schema:\n${schemaText}`;
}

/** The JSON object in a plain-text answer, checked against the schema. */
export function parseJsonRecord(text: string): Output {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('The AI answer had no JSON record');
  const parsed = outputSchema.safeParse(JSON.parse(text.slice(start, end + 1)));
  if (!parsed.success) throw new Error('The AI answer was not in the expected format');
  return parsed.data;
}

/** A failure worth trying again later: the API was busy, rate-limited or unreachable. */
export function isTransientAiError(error: string): boolean {
  return /^(408|409|429|5\d\d)\b|overloaded|rate_limit|timed out|timeout|connection error|ECONNRESET|socket hang up/i.test(
    error,
  );
}

/**
 * AI reader: works out what a document is (bill, receipt, payment problem,
 * overdue reminder, payment confirmation, other) and extracts the matching
 * fields via the Claude API, so no per-provider reader is needed.
 */
export const anthropicExtractor: Extractor = {
  name: 'llm:anthropic',

  canHandle(input) {
    return Boolean(getEnv().ANTHROPIC_API_KEY) && (input.text.trim().length > 40 || !!input.file);
  },

  async extract(input): Promise<ExtractionResult | null> {
    const env = getEnv();
    if (!env.ANTHROPIC_API_KEY) return null;
    client ??= new Anthropic({
      apiKey: env.ANTHROPIC_API_KEY,
      // Overloaded (529) and rate-limited (429) answers are retried with backoff.
      maxRetries: 5,
      ...(env.ANTHROPIC_WORKSPACE_ID
        ? { defaultHeaders: { 'anthropic-workspace-id': env.ANTHROPIC_WORKSPACE_ID } }
        : {}),
    });
    const units = listUnits()
      .map((u) => u.key)
      .join(', ');
    const services =
      input.services.map((s) => `${s.name} (${s.provider}, type ${s.typeSlug})`).join('; ') ||
      'none yet';
    const userText = [
      `Household locale: ${input.locale}. Default currency: ${input.defaultCurrency}.`,
      `Allowed service types: ${input.serviceTypes.join(', ')}.`,
      `Allowed usage unit keys: ${units}.`,
      `Known services: ${services}.`,
      input.filename ? `Filename: ${input.filename}` : null,
      input.email?.from ? `Email from: ${input.email.from}` : null,
      input.email?.subject ? `Email subject: ${input.email.subject}` : null,
      input.hint === 'bill'
        ? 'A household member has confirmed this document IS a bill: set document_type to "bill" and read its bill details (for a forwarded email, the bill inside it).'
        : null,
      '',
      ...(input.file
        ? [
            'The document is attached as a scan or photo with no text layer. Read it from the image; if part of it is unreadable, lower your confidence and say which part in notes.',
          ]
        : ['DOCUMENT TEXT:', input.text.slice(0, 60_000)]),
    ]
      .filter((l) => l !== null)
      .join('\n');

    const document = input.file ? [fileBlock(input.file)] : [];
    const system = [
      { type: 'text' as const, text: SYSTEM, cache_control: { type: 'ephemeral' as const } },
    ];
    let record: Output | null;
    try {
      const response = await oneAtATime(() =>
        client!.messages.parse({
          model: env.ANTHROPIC_MODEL,
          // Room for adaptive thinking (on by default on current models) plus the record.
          max_tokens: 16_000,
          system,
          messages: [{ role: 'user', content: [...document, { type: 'text', text: userText }] }],
          output_config: { format: zodOutputFormat(outputSchema) },
        }),
      );
      if (response.stop_reason === 'refusal') return null;
      record = response.parsed_output;
    } catch (e) {
      if (!isSchemaTooLarge(e)) throw e;
      // Safety net: ask for the same record as plain JSON and check it here.
      console.warn('[ai] structured output refused the schema; reading as plain JSON');
      const response = await oneAtATime(() =>
        client!.messages.create({
          model: env.ANTHROPIC_MODEL,
          max_tokens: 16_000,
          system,
          messages: [
            {
              role: 'user',
              content: [
                ...document,
                { type: 'text', text: userText },
                { type: 'text', text: jsonInstruction() },
              ],
            },
          ],
        }),
      );
      if (response.stop_reason === 'refusal') return null;
      record = parseJsonRecord(
        response.content.map((c) => (c.type === 'text' ? c.text : '')).join(''),
      );
    }
    if (!record) return null;
    return toResult(record, input, this.name);
  },
};

type Output = z.infer<typeof outputSchema>;

/** A real YYYY-MM-DD date, or null. */
const day = (s: string | null | undefined): string | null => (s && isIsoDate(s) ? s : null);

/**
 * The instalments as printed, when they make a real plan: two or more, each
 * with a valid date and a positive amount, in date order. Anything else is
 * dropped with a warning (the bill itself is still read).
 */
function instalmentOptions(
  list: { due_date: string; amount: number }[] | null | undefined,
  currency: string,
  warnings: string[],
): BillInstalmentOption[] | null {
  if (!list?.length) return null;
  const digits = minorUnitDigits(currency);
  const out = list.map((i) => ({
    dueDate: day(i.due_date) ?? '',
    amountMinor: Math.round(i.amount * 10 ** digits),
  }));
  if (out.length < 2 || out.some((i) => !i.dueDate || i.amountMinor <= 0)) {
    warnings.push('The instalment options could not be read');
    return null;
  }
  return out.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

/** Map the model's record onto the pipeline's types. Exported for tests. */
export function toResult(
  o: Output,
  input: {
    services: { id: string; provider: string }[];
    serviceTypes: string[];
    defaultCurrency: string;
  },
  extractor = 'llm:anthropic',
): ExtractionResult | null {
  const warnings: string[] = [];
  if (o.notes) warnings.push(o.notes);
  const provider = o.provider ?? '';
  const serviceType =
    o.service_type && input.serviceTypes.includes(o.service_type) ? o.service_type : 'other';
  if (o.service_type && serviceType !== o.service_type)
    warnings.push(`Unknown service type "${o.service_type}", set to other`);
  const minor = (amount: number | null, currency: string) =>
    amount === null ? null : Math.round(amount * 10 ** minorUnitDigits(currency));

  if (o.document_type !== 'bill' || !o.bill) {
    const kind: DocumentKind = o.document_type === 'bill' ? 'other' : o.document_type;
    const currency = (o.payment?.currency ?? input.defaultCurrency).toUpperCase().slice(0, 3);
    const amountMinor = minor(o.payment?.amount ?? null, currency);
    // Not a bill: `bill` only carries what's known; the pipeline routes on `document`.
    const bill: ExtractedBill = {
      provider,
      serviceType,
      amountMinor: amountMinor ?? 0,
      currency,
      periodStart: '',
      periodEnd: '',
      dueDate: '',
      serviceId: null, // matchService() picks it (provider and type)
    };
    return {
      extractor,
      bill,
      confidence: o.confidence,
      warnings,
      document: {
        kind,
        provider: o.provider,
        date: day(o.document_date),
        payment: o.payment
          ? {
              date: day(o.payment.date),
              amountMinor,
              currency,
              invoiceRefs: o.payment.invoice_numbers.map((n) => n.replace(/^#/, '').trim()),
            }
          : null,
      },
    };
  }

  const b = o.bill;
  const currency = b.currency.toUpperCase().slice(0, 3) || input.defaultCurrency;
  const usageUnit =
    b.usage_unit && listUnits().some((u) => u.key === b.usage_unit) ? b.usage_unit : null;
  if (b.usage_unit && !usageUnit) warnings.push(`Unknown usage unit "${b.usage_unit}"`);
  const bill: ExtractedBill = {
    provider,
    serviceType,
    amountMinor: minor(b.amount, currency)!,
    currency,
    taxMinor: minor(b.tax_amount, currency),
    taxLabel: b.tax_label,
    periodStart: day(b.period_start) ?? '',
    periodEnd: day(b.period_end) ?? '',
    issueDate: day(b.issue_date),
    dueDate: day(b.due_date) ?? '',
    usageQuantity: b.usage_quantity,
    usageUnit,
    externalRef: b.invoice_number,
    accountRef: b.account_number,
    serviceId: null, // matchService() picks it (provider and type)
    autoPay: b.auto_pay ?? undefined,
    previousPayment:
      b.previous_payment && day(b.previous_payment.due_date)
        ? {
            dueDate: b.previous_payment.due_date,
            amountDueMinor: minor(b.previous_payment.amount_due, currency)!,
            receivedMinor: minor(b.previous_payment.amount_received, currency)!,
          }
        : null,
    metrics: (b.metrics ?? []).map((m) => ({
      key: m.key,
      label: m.label,
      kind: m.kind,
      value: m.value,
      unit: m.unit,
      amountMinor: minor(m.amount, currency),
      currency: m.amount === null ? null : currency,
      periodStart: day(m.period_start),
      periodEnd: day(m.period_end),
    })),
    instalments: instalmentOptions(b.instalments, currency, warnings),
  };
  if (!bill.periodStart || !bill.periodEnd || !bill.dueDate) {
    warnings.push('A billing date could not be read (expected YYYY-MM-DD)');
    return { extractor, bill, confidence: Math.min(o.confidence, 0.3), warnings };
  }
  if (bill.periodEnd < bill.periodStart) {
    warnings.push('Period end before start');
    return { extractor, bill, confidence: Math.min(o.confidence, 0.3), warnings };
  }
  return {
    extractor,
    bill,
    confidence: o.confidence,
    warnings,
    document: { kind: 'bill', provider: o.provider, payment: null, date: day(o.document_date) },
  };
}
