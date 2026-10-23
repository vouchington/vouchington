import { callAnthropicJson, type AnthropicDeps } from './anthropic-generate.mts'
import {
  assertSupportedRequest as assertRequest,
  type GenerateJsonRequest,
} from '@vouchington/ai/providers'
import { callOpenAIJson, type OpenAIDeps } from './openai-generate.mts'
import { MODEL_PRICES } from './pricing-table.mts'

import type { ModelCallResult, ModelSelection, OpenAITransport } from './types.mts'

/** Models that return a 400 for any non-default `temperature`, `top_p` or `top_k`. */
const REJECTS_SAMPLING_PARAMETERS = new Set(['anthropic:claude-haiku-5-5'])

export type GenerateJsonOptions = {
  /** The global OpenAI transport setting; read by the agent layer, never chosen per agent. */
  openaiTransport: OpenAITransport
  signal?: AbortSignal
  deps?: AnthropicDeps & OpenAIDeps
}

export function assertSupportedRequest(
  selection: ModelSelection,
  request: Pick<GenerateJsonRequest<unknown>, 'temperature' | 'topP' | 'topK'>,
): void {
  assertRequest(selection, request, {
    prices: MODEL_PRICES,
    rejectsSamplingParameters: REJECTS_SAMPLING_PARAMETERS,
  })
}

/* no-mistakes: integration=anthropic */
/* no-mistakes: integration=openai */
/**
 * A single model call returning JSON validated against the request's schema, on whichever provider
 * the caller selected. Every result carries the served model, response id and provider-neutral
 * usage; every billed-but-unusable answer is a `ModelProviderError` carrying its billed response.
 */
/* no-mistakes: integration=anthropic */
/* no-mistakes: integration=openai */
export async function generateJson<T>(
  selection: ModelSelection,
  request: GenerateJsonRequest<T>,
  options: GenerateJsonOptions,
): Promise<ModelCallResult<T>> {
  assertSupportedRequest(selection, request)
  if (selection.provider === 'anthropic')
    return callAnthropicJson(selection.model, request, options.deps, options.signal)
  return callOpenAIJson(selection.model, options.openaiTransport, request, options.deps)
}
