import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { getEnv } from '@/lib/env';
import { minorUnitDigits } from '@/lib/format';
import { listUnits } from '@/lib/units';
import type { ExtractedBill, ExtractionResult, Extractor } from '../types';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const outputSchema = z.object({
  is_utility_bill: z
    .boolean()
    .describe('False if the text is not a bill or invoice for a household service'),
  provider: z.string().describe('Company issuing the bill, as printed'),
  service_type: z.string().describe('One of the household service types, or "other"'),
  amount: z
    .number()
    .describe('Total amount due for this bill, in major currency units (e.g. 129.00)'),
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
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe('Your confidence that every field above is correct'),
  notes: z
    .string()
    .nullable()
    .describe('Anything ambiguous, e.g. multiple amounts or an estimated read'),
});

const SYSTEM = `You extract structured data from household utility bills (internet, electricity, gas, water, rent and similar).
You receive the plain text of one bill. Return exactly one bill record.
Rules:
- amount is the total the customer must pay for THIS bill (not the account balance, not previous payments, not usage charges before tax).
- Dates are ISO YYYY-MM-DD. If the text prints dates numerically, use the locale hint to decide day/month order.
- If the bill covers a period, period_start and period_end are the first and last days inclusive. If only an issue date is given for a monthly service, use a one-month period starting on the issue date.
- Map usage to the closest unit key from the allowed list (e.g. MJ for gas megajoules, kWh for electricity, kL or m3 for water). Use null if there is no metered usage.
- Choose service_type from the household's list. Use "other" if none fit.
- Set is_utility_bill=false for receipts, marketing, or anything that is not a bill.
- Lower your confidence when amounts conflict, text is garbled, or fields are inferred rather than read.`;

let client: Anthropic | undefined;

/** LLM fallback: turns any bill layout into a structured record via the Claude API. */
export const anthropicExtractor: Extractor = {
  name: 'llm:anthropic',

  canHandle(input) {
    return Boolean(getEnv().ANTHROPIC_API_KEY) && input.text.trim().length > 40;
  },

  async extract(input): Promise<ExtractionResult | null> {
    const env = getEnv();
    if (!env.ANTHROPIC_API_KEY) return null;
    client ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
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
      'BILL TEXT:',
      input.text.slice(0, 60_000),
    ]
      .filter((l) => l !== null)
      .join('\n');

    const response = await client.messages.parse({
      model: env.ANTHROPIC_MODEL,
      max_tokens: 2048,
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userText }],
      output_config: { format: zodOutputFormat(outputSchema) },
    });
    if (response.stop_reason === 'refusal' || !response.parsed_output) return null;
    const o = response.parsed_output;
    if (!o.is_utility_bill) return null;

    const currency = o.currency.toUpperCase().slice(0, 3) || input.defaultCurrency;
    const digits = minorUnitDigits(currency);
    const warnings: string[] = [];
    if (o.notes) warnings.push(o.notes);
    const serviceType = input.serviceTypes.includes(o.service_type) ? o.service_type : 'other';
    if (serviceType !== o.service_type)
      warnings.push(`Unknown service type "${o.service_type}", set to other`);
    const usageUnit =
      o.usage_unit && listUnits().some((u) => u.key === o.usage_unit) ? o.usage_unit : null;
    if (o.usage_unit && !usageUnit) warnings.push(`Unknown usage unit "${o.usage_unit}"`);
    const service =
      input.services.find((s) => s.provider.toLowerCase() === o.provider.toLowerCase()) ??
      input.services.find(
        (s) =>
          o.provider.toLowerCase().includes(s.provider.toLowerCase()) ||
          s.provider.toLowerCase().includes(o.provider.toLowerCase()),
      );

    const bill: ExtractedBill = {
      provider: o.provider,
      serviceType,
      amountMinor: Math.round(o.amount * 10 ** digits),
      currency,
      taxMinor: o.tax_amount === null ? null : Math.round(o.tax_amount * 10 ** digits),
      taxLabel: o.tax_label,
      periodStart: o.period_start,
      periodEnd: o.period_end,
      issueDate: o.issue_date,
      dueDate: o.due_date,
      usageQuantity: o.usage_quantity,
      usageUnit,
      externalRef: o.invoice_number,
      accountRef: o.account_number,
      serviceId: service?.id ?? null,
    };
    if (bill.periodEnd < bill.periodStart) {
      warnings.push('Period end before start');
      return { extractor: this.name, bill, confidence: Math.min(o.confidence, 0.3), warnings };
    }
    return { extractor: this.name, bill, confidence: o.confidence, warnings };
  },
};
