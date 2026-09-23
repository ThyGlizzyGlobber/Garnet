/**
 * The pluggable extraction interface. Template parsers, the LLM extractor, and
 * any future method (local model, CDR API) all implement `Extractor`.
 */

export interface ExtractionInput {
  /** Plain text of the bill (PDF text, HTML→text, or email body). */
  text: string;
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
}

export interface ExtractionResult {
  extractor: string;
  bill: ExtractedBill;
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
