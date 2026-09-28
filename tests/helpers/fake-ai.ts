/**
 * A stand-in for the AI reader, installed for every test file by
 * tests/setup.ts, so the pipeline runs without calling the API. Answers go
 * through the real mapping (toResult). By default it reads the redacted Aussie
 * Broadband fixtures the way the real reader does and returns nothing for
 * anything else; scriptAi() overrides that for a test file.
 */
export type AiOutput = Parameters<typeof import('@/ingest/extractors/llm/anthropic').toResult>[0];

type Input = import('@/ingest/extractors/types').ExtractionInput;
let script: AiOutput | ((text: string, input: Input) => AiOutput | null) | null = null;

export function scriptAi(answer: typeof script): void {
  script = answer;
}

export function fakeAiAnswer(text: string, input: Input): AiOutput | null {
  if (typeof script === 'function') return script(text, input);
  return script ?? readFixture(text);
}

const blank: AiOutput = {
  document_type: 'other',
  provider: null,
  document_date: null,
  service_type: null,
  bill: null,
  payment: null,
  confidence: 0.95,
  notes: null,
};

function readFixture(t: string): AiOutput | null {
  if (!/aussie\s*broadband/i.test(t)) return null;
  if (/PAYMENT RECEIPT/.test(t)) {
    const [d, m, y] = (t.match(/PAYMENT RECEIPT\s*\n\s*(\d{2})-(\d{2})-(\d{4})/) ?? []).slice(1);
    return {
      ...blank,
      document_type: 'payment_receipt',
      provider: 'Aussie Broadband',
      document_date: null,
      service_type: 'internet',
      payment: {
        date: `${y}-${m}-${d}`,
        amount: 129,
        currency: 'AUD',
        invoice_numbers: [...t.matchAll(/INVOICE\s*#\s*(\d+)/g)].map((x) => x[1]!),
      },
    };
  }
  if (!/Tax Invoice/.test(t)) return null;
  const received = Number(t.match(/\$129\.00 \$([\d.]+) 28 May 2026/)?.[1] ?? 129);
  return {
    ...blank,
    document_type: 'bill',
    provider: 'Aussie Broadband',
    document_date: null,
    service_type: 'internet',
    bill: {
      amount: 129,
      currency: 'AUD',
      tax_amount: 11.73,
      tax_label: 'GST',
      period_start: '2026-06-14',
      period_end: '2026-07-13',
      issue_date: '2026-06-14',
      due_date: '2026-06-26',
      usage_quantity: null,
      usage_unit: null,
      invoice_number: t.match(/Invoice Number: (\d+)/)?.[1] ?? null,
      account_number: '14809800',
      auto_pay: true,
      previous_payment: { due_date: '2026-05-28', amount_due: 129, amount_received: received },
      metrics: [],
    },
    confidence: 0.97,
  };
}
