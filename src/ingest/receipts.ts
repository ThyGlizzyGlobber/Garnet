import { parseAmount, parseDate } from './extractors/dates';

/**
 * Payment receipts: a provider confirming it took a payment and which invoices
 * it covered. Deterministic per-provider parsers, like the bill templates.
 */
export interface PaymentReceipt {
  provider: string;
  paidDate: string;
  totalMinor: number;
  method: string | null;
  invoices: { ref: string; amountMinor: number }[];
}

type ReceiptParser = (text: string, locale: string) => PaymentReceipt | null;

/** Aussie Broadband "PAYMENT RECEIPT" PDFs (2026 layout). */
const aussieBroadband: ReceiptParser = (t, locale) => {
  if (!/PAYMENT RECEIPT/.test(t) || !/aussie\s*broadband/i.test(t)) return null;
  const date = t.match(/PAYMENT RECEIPT\s*\n\s*(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})/)?.[1];
  const total = t.match(/Payment Total:?\s*\$([\d,]+\.\d{2})/i)?.[1];
  const method = t.match(/Payment Method:?\s*([^\n]+)/i)?.[1]?.trim() ?? null;
  const invoices = [...t.matchAll(/INVOICE\s*#\s*(\d{6,})\s+\$([\d,]+\.\d{2})/gi)]
    .map((m) => ({ ref: m[1]!, amountMinor: parseAmount(m[2]) }))
    .filter((x): x is { ref: string; amountMinor: number } => x.amountMinor !== null);
  const paidDate = parseDate(date, locale);
  const totalMinor = parseAmount(total);
  if (!paidDate || totalMinor === null || !invoices.length) return null;
  return { provider: 'Aussie Broadband', paidDate, totalMinor, method, invoices };
};

const PARSERS: ReceiptParser[] = [aussieBroadband];

export function parseReceipt(text: string, locale = 'en-AU'): PaymentReceipt | null {
  for (const p of PARSERS) {
    const r = p(text, locale);
    if (r) return r;
  }
  return null;
}
