import type { ExtractedBill, ExtractionResult, Extractor } from '../types';
import { parseAmount, parseDate } from '../dates';

/**
 * Deterministic parser for Aussie Broadband tax invoices (PDF text layout as of 2026).
 * Anchors on labelled fields so column order in the PDF text doesn't matter.
 */
export const aussieBroadbandExtractor: Extractor = {
  name: 'template:aussie-broadband',

  canHandle(input) {
    return (
      /aussie\s*broadband/i.test(input.text) ||
      /aussiebb|aussiebroadband/i.test(input.email?.from ?? '')
    );
  },

  async extract(input): Promise<ExtractionResult | null> {
    const t = input.text;
    const warnings: string[] = [];
    const period = t.match(
      /Billing Period:\s*(\d{1,2}\s+\w{3,9}\s+\d{4})\s*(?:-|–|->)\s*(\d{1,2}\s+\w{3,9}\s+\d{4})/i,
    );
    const invoice =
      t.match(/Invoice Number:?\s*(\d{6,})/i) ?? t.match(/Invoice Number\s*\n(\d{6,})/i);
    // pdf-parse emits the three labels then the three values on consecutive lines.
    const block = t.match(
      /Issue Date\s*\nInvoice Number\s*\nCustomer Number\s*\n(\d{1,2}\s+\w{3,9}\s+\d{4})\s*\n(\d{6,})\s*\n(\d{6,})/i,
    );
    const customer = block ? [block[0], block[3]] : t.match(/Customer Number:?\s*(\d{6,})/i);
    const gst = t.match(/\$([\d,]+\.\d{2})\s*GST/i);
    const issue = block
      ? [block[0], block[1]]
      : t.match(/Issue Date:?\s*(\d{1,2}\s+\w{3,9}\s+\d{4})/i);
    const due =
      t.match(/Debit Date:?\s*(\d{1,2}\s+\w{3,9}\s+\d{4})/i) ??
      t.match(/Due Date[\s\S]{0,120}?(\d{1,2}\s+\w{3,9}\s+\d{4})/i);
    // Total Due is the amount on the "This Invoice + Outstanding = Total Due" line; prefer "This Invoice".
    const total = t.match(/\$([\d,]+\.\d{2})\s*\+\s*\$[\d,]+\.\d{2}\s*=\s*\$([\d,]+\.\d{2})/);
    const amountDue = t.match(/Amount Due[\s\S]{0,80}?\$([\d,]+\.\d{2})/i);

    const amountMinor = parseAmount(total?.[1] ?? amountDue?.[1]);
    const periodStart = parseDate(period?.[1], input.locale);
    const periodEnd = parseDate(period?.[2], input.locale);
    const dueDate = parseDate(due?.[1], input.locale);
    if (amountMinor === null || !periodStart || !periodEnd || !dueDate) return null;

    let issueDate = parseDate(issue?.[1], input.locale);
    if (!issueDate) {
      // Aussie Broadband issues on the first day of the billing period.
      issueDate = periodStart;
      warnings.push('Issue date not found; assumed billing period start');
    }
    const service = input.services.find((s) => /aussie\s*broadband/i.test(s.provider));
    const bill: ExtractedBill = {
      provider: 'Aussie Broadband',
      serviceType: 'internet',
      amountMinor,
      currency: 'AUD',
      taxMinor: parseAmount(gst?.[1]),
      taxLabel: gst ? 'GST' : null,
      periodStart,
      periodEnd,
      issueDate,
      dueDate,
      usageQuantity: null,
      usageUnit: null,
      externalRef: invoice?.[1] ?? null,
      accountRef: customer?.[1] ?? null,
      serviceId: service?.id ?? null,
    };
    if (!bill.externalRef) warnings.push('Invoice number not found');
    const confidence = bill.externalRef ? 0.98 : 0.85;
    return { extractor: this.name, bill, confidence, warnings };
  },
};
