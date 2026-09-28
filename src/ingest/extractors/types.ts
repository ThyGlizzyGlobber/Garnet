/**
 * The pluggable extraction interface. Template parsers, the LLM extractor, and
 * any future method (local model, CDR API) all implement `Extractor`.
 */

/** A scan or photo with no text layer, sent to the AI reader as the file itself. */
export interface ScanFile {
  mediaType: 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
  data: Buffer;
}

export interface ExtractionInput {
  /** Plain text of the bill (PDF text, HTML→text, or email body). */
  text: string;
  /** Set only when the document has no text (a scan or photo). */
  file?: ScanFile | null;
  /** Original filename, when known. */
  filename?: string | null;
  /** Email metadata, when the document arrived by mail. */
  email?: { from?: string | null; subject?: string | null } | null;
  /** Locale hint for day/month order, e.g. en-AU or en-US. */
  locale: string;
  /** Household default currency, used when the bill doesn't state one. */
  defaultCurrency: string;
  /** Known services so the extractor can match provider names. */
  services: { id: string; name: string; provider: string; typeSlug: string }[];
  /** Service type slugs the household recognises. */
  serviceTypes: string[];
}

export interface ExtractedBill {
  provider: string;
  serviceType: string;
  amountMinor: number;
  currency: string;
  taxMinor?: number | null;
  taxLabel?: string | null;
  periodStart: string;
  periodEnd: string;
  issueDate?: string | null;
  dueDate: string;
  usageQuantity?: number | null;
  usageUnit?: string | null;
  externalRef?: string | null;
  accountRef?: string | null;
  /** Service id when the extractor is confident which existing service this is. */
  serviceId?: string | null;
  /**
   * What the provider says about the previous bill ("Last month: $129 due,
   * $129 received, due 28 May") — used to mark that bill paid to the provider.
   */
  previousPayment?: { dueDate: string; amountDueMinor: number; receivedMinor: number } | null;
  /** The provider takes payment automatically (card on file / direct debit). */
  autoPay?: boolean;
  /** Every other figure on the bill (usage by tariff, readings, charges, rates…). */
  metrics?: ExtractedMetric[];
}

export interface ExtractedMetric {
  key: string;
  label: string;
  kind: 'usage' | 'reading' | 'charge' | 'rate' | 'average' | 'comparison' | 'other';
  /** Quantities and rates. */
  value: number | null;
  unit: string | null;
  /** Money (charges, credits; negative for credits and discounts). */
  amountMinor: number | null;
  currency: string | null;
  periodStart: string | null;
  periodEnd: string | null;
}

/** What a document is, when an extractor can tell (the AI reader can; templates only read bills). */
export type DocumentKind =
  'bill' | 'payment_receipt' | 'payment_failed' | 'overdue_notice' | 'payment_received' | 'other';

export interface DocumentInfo {
  kind: DocumentKind;
  provider: string | null;
  /** For receipts and payment notices: what was (or wasn't) paid. */
  payment: {
    date: string | null;
    amountMinor: number | null;
    currency: string | null;
    invoiceRefs: string[];
  } | null;
}

export interface ExtractionResult {
  extractor: string;
  bill: ExtractedBill;
  /**
   * Set when the document isn't a bill (receipt, payment notice, other). The
   * pipeline routes on it before any bill logic; `bill` then only carries the
   * provider and whatever amounts were printed.
   */
  document?: DocumentInfo;
  /** Overall confidence in [0,1]. Below the household threshold → review queue. */
  confidence: number;
  /** Per-field confidence when the extractor can tell. */
  fieldConfidence?: Partial<Record<keyof ExtractedBill, number>>;
  warnings: string[];
}

export interface Extractor {
  readonly name: string;
  /** Cheap test to skip extractors that obviously don't apply. */
  canHandle(input: ExtractionInput): boolean;
  /** Return null when the extractor can't produce anything usable. */
  extract(input: ExtractionInput): Promise<ExtractionResult | null>;
}
