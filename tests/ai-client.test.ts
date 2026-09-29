import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

/**
 * The real AI reader (tests/setup.ts replaces it everywhere else) against a
 * stand-in API client: no network calls.
 */
const calls = { parse: 0, create: 0 };
let parseError: Error | null = null;
let createText = '';

vi.mock('@anthropic-ai/sdk', () => {
  class FakeAnthropic {
    messages = {
      parse: async () => {
        calls.parse++;
        if (parseError) throw parseError;
        return { stop_reason: 'end_turn', parsed_output: null };
      },
      create: async () => {
        calls.create++;
        return { stop_reason: 'end_turn', content: [{ type: 'text', text: createText }] };
      },
    };
  }
  return { default: FakeAnthropic };
});

const real = await vi.importActual<typeof import('@/ingest/extractors/llm/anthropic')>(
  '@/ingest/extractors/llm/anthropic',
);
const { resetEnvCache } = await import('@/lib/env');

beforeAll(() => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
  resetEnvCache();
});
afterAll(() => {
  delete process.env.ANTHROPIC_API_KEY;
  resetEnvCache();
});

const input = {
  text: 'Aussie Broadband payment receipt with plenty of readable text in it for the reader.',
  locale: 'en-AU',
  defaultCurrency: 'AUD',
  services: [],
  serviceTypes: ['internet'],
  email: null,
  filename: 'receipt.pdf',
};

const receipt = {
  document_type: 'payment_receipt',
  provider: 'Aussie Broadband',
  document_date: '2026-07-28',
  service_type: 'internet',
  bill: null,
  payment: { date: '2026-07-28', amount: 129, currency: 'AUD', invoice_numbers: ['50000002'] },
  page_rotation: [],
  confidence: 0.96,
  notes: null,
};

describe('the AI output schema', () => {
  it('has no regex patterns, which made the compiled grammar too large', () => {
    const schema = JSON.stringify(z.toJSONSchema(real.outputSchema));
    expect(schema).not.toContain('"pattern"');
  });
});

describe('when the API refuses the schema as too large', () => {
  it('asks again for plain JSON and checks it against the same schema', async () => {
    parseError = new Error(
      '400 {"type":"error","error":{"type":"invalid_request_error","message":"The compiled grammar is too large, which would cause performance issues."}}',
    );
    createText = `Here is the record:\n${JSON.stringify(receipt)}`;
    const r = await real.anthropicExtractor.extract(input);
    expect(calls).toEqual({ parse: 1, create: 1 });
    expect(r?.document?.kind).toBe('payment_receipt');
    expect(r?.document?.payment?.invoiceRefs).toEqual(['50000002']);
    expect(r?.document?.date).toBe('2026-07-28');
  });

  it('fails loudly when the plain answer isn’t a valid record', async () => {
    createText = '{"document_type":"invoice-ish"}';
    await expect(real.anthropicExtractor.extract(input)).rejects.toThrow(/expected format/);
  });

  it('passes other API errors straight through', async () => {
    parseError = new Error('401 invalid x-api-key');
    const before = calls.create;
    await expect(real.anthropicExtractor.extract(input)).rejects.toThrow(/401/);
    expect(calls.create).toBe(before);
    expect(real.isSchemaTooLarge(parseError)).toBe(false);
  });
});

describe('dates in the AI record', () => {
  it('are checked: a bad billing date sends the bill to review, other bad dates are dropped', () => {
    const bill = {
      amount: 129,
      currency: 'AUD',
      tax_amount: null,
      tax_label: null,
      period_start: '14/06/2026',
      period_end: '2026-07-13',
      issue_date: 'June 14',
      due_date: '2026-06-26',
      usage_quantity: null,
      usage_unit: null,
      invoice_number: '1',
      account_number: null,
      auto_pay: null,
      previous_payment: { due_date: 'last month', amount_due: 129, amount_received: 129 },
      metrics: [],
      instalments: null,
    };
    const r = real.toResult(
      {
        ...receipt,
        document_type: 'bill',
        document_date: '2026-13-40',
        payment: null,
        bill,
      } as Parameters<typeof real.toResult>[0],
      input,
    )!;
    expect(r.confidence).toBe(0.3);
    expect(r.warnings.join(' ')).toMatch(/billing date could not be read/);
    expect(r.bill.issueDate).toBeNull();
    expect(r.bill.previousPayment).toBeNull();
  });
});
