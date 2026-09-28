import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { getEnv } from '@/lib/env';
import { minorUnitDigits } from '@/lib/format';
import { listUnits } from '@/lib/units';
import type { DocumentKind, ExtractedBill, ExtractionResult, Extractor } from '../types';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const outputSchema = z.object({
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
  service_type: z.string().nullable().describe('One of the household service types, or "other"'),
  bill: z
    .object({
      amount: z.number().describe('Total amount due for THIS bill, in major units (e.g. 129.00)'),
      currency: z.string().describe('ISO 4217 code, e.g. AUD, USD, EUR'),
      tax_amount: z.number().nullable().describe('Tax included in the amount, if stated'),
      tax_label: z.string().nullable().describe('GST, VAT, sales tax, etc.'),
      period_start: isoDate.describe('First day of the billing period, YYYY-MM-DD'),
      period_end: isoDate.describe('Last day of the billing period, YYYY-MM-DD'),
      issue_date: isoDate.nullable(),
      due_date: isoDate.describe('Payment due or direct-debit date, YYYY-MM-DD'),
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
- Choose service_type from the household's list. Use "other" if none fit.
Rules for everything:
- Dates are ISO YYYY-MM-DD. If the text prints dates numerically, use the locale hint to decide day/month order.
- A receipt or "your payment was successful" email is never a bill, even though it shows an amount.
- Conditional wording on a bill ("if your payment fails, a fee applies") does not make it a payment_failed notice.
- Lower your confidence when amounts conflict, text is garbled, or fields are inferred rather than read.`;

let client: Anthropic | undefined;

/**
 * AI reader: works out what a document is (bill, receipt, payment problem,
 * overdue reminder, payment confirmation, other) and extracts the matching
 * fields via the Claude API, so no per-provider reader is needed.
 */
export const anthropicExtractor: Extractor = {
  name: 'llm:anthropic',

  canHandle(input) {
    return Boolean(getEnv().ANTHROPIC_API_KEY) && input.text.trim().length > 40;
  },

  async extract(input): Promise<ExtractionResult | null> {
    const env = getEnv();
    if (!env.ANTHROPIC_API_KEY) return null;
    client ??= new Anthropic({
      apiKey: env.ANTHROPIC_API_KEY,
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
      '',
      'DOCUMENT TEXT:',
      input.text.slice(0, 60_000),
    ]
      .filter((l) => l !== null)
      .join('\n');

    const response = await client.messages.parse({
      model: env.ANTHROPIC_MODEL,
      // Room for adaptive thinking (on by default on current models) plus the record.
      max_tokens: 16_000,
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userText }],
      output_config: { format: zodOutputFormat(outputSchema) },
    });
    if (response.stop_reason === 'refusal' || !response.parsed_output) return null;
    return toResult(response.parsed_output, input, this.name);
  },
};

type Output = z.infer<typeof outputSchema>;

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
  const service = provider
    ? (input.services.find((s) => s.provider.toLowerCase() === provider.toLowerCase()) ??
      input.services.find(
        (s) =>
          provider.toLowerCase().includes(s.provider.toLowerCase()) ||
          s.provider.toLowerCase().includes(provider.toLowerCase()),
      ))
    : undefined;
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
      serviceId: service?.id ?? null,
    };
    return {
      extractor,
      bill,
      confidence: o.confidence,
      warnings,
      document: {
        kind,
        provider: o.provider,
        payment: o.payment
          ? {
              date: o.payment.date,
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
    periodStart: b.period_start,
    periodEnd: b.period_end,
    issueDate: b.issue_date,
    dueDate: b.due_date,
    usageQuantity: b.usage_quantity,
    usageUnit,
    externalRef: b.invoice_number,
    accountRef: b.account_number,
    serviceId: service?.id ?? null,
    autoPay: b.auto_pay ?? undefined,
    previousPayment: b.previous_payment
      ? {
          dueDate: b.previous_payment.due_date,
          amountDueMinor: minor(b.previous_payment.amount_due, currency)!,
          receivedMinor: minor(b.previous_payment.amount_received, currency)!,
        }
      : null,
  };
  if (bill.periodEnd < bill.periodStart) {
    warnings.push('Period end before start');
    return { extractor, bill, confidence: Math.min(o.confidence, 0.3), warnings };
  }
  return {
    extractor,
    bill,
    confidence: o.confidence,
    warnings,
    document: { kind: 'bill', provider: o.provider, payment: null },
  };
}
