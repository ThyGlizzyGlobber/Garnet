import { anthropicExtractor } from './llm/anthropic';
import type { Extractor } from './types';

/**
 * Ordered: deterministic per-provider template parsers first, then the AI
 * reader. No templates ship: the AI reader classifies and reads every
 * provider's documents (owner decision, 2026-09-28). The slot stays so a
 * template can be added if a provider ever needs one.
 */
export const templateExtractors: Extractor[] = [];
export const fallbackExtractors: Extractor[] = [anthropicExtractor];
export const allExtractors: Extractor[] = [...templateExtractors, ...fallbackExtractors];
