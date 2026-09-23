import { anthropicExtractor } from './llm/anthropic';
import { aussieBroadbandExtractor } from './template/aussie-broadband';
import type { Extractor } from './types';

/** Ordered: deterministic template parsers first, LLM fallback last. */
export const templateExtractors: Extractor[] = [aussieBroadbandExtractor];
export const fallbackExtractors: Extractor[] = [anthropicExtractor];
export const allExtractors: Extractor[] = [...templateExtractors, ...fallbackExtractors];

export type { ExtractedBill, ExtractionInput, ExtractionResult, Extractor } from './types';
