import { vi } from 'vitest';
import type { ExtractionInput, ExtractionResult } from '@/ingest/extractors/types';
import { fakeAiAnswer } from './helpers/fake-ai';

// Every test file reads documents with the stand-in AI (see helpers/fake-ai.ts).
vi.mock('@/ingest/extractors/llm/anthropic', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/ingest/extractors/llm/anthropic')>();
  return {
    ...actual,
    anthropicExtractor: {
      name: 'llm:anthropic',
      canHandle: (input: ExtractionInput) => input.text.trim().length > 40 || !!input.file,
      extract: async (input: ExtractionInput): Promise<ExtractionResult | null> => {
        const answer = fakeAiAnswer(input.text, input);
        return answer ? actual.toResult(answer, input) : null;
      },
    },
  };
});
