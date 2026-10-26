import {
  type GenerateJsonRequest,
  type ModelCallResult,
  assertSupportedRequest as assertSupported,
  callAnthropicJson,
  callOpenAIJson,
} from '@vouchington/ai/providers'
import {
  createAnthropicMessage,
  openAIResponseCreator,
  type AnthropicDeps,
  type OpenAIDeps,
} from './clients.mts'
import { MODEL_PRICES } from './pricing-table.mts'
import type { ModelSelection, OpenAITransport } from './types.mts'

/** Models that return a 400 for any non-default `temperature`, `top_p` or `top_k`. */
const REJECTS_SAMPLING_PARAMETERS = new Set(['anthropic:claude-haiku-5-5'])

export type GenerateJsonOptions = {
  /** The global OpenAI transport setting; read by the agent layer, never chosen per agent. */
  openaiTransport: OpenAITransport
  signal?: AbortSignal
  deps?: AnthropicDeps & OpenAIDeps
}

/** Rejects, before any request, what the selected model cannot take or has no price row for. */
export function assertSupportedRequest(
  selection: ModelSelection,
  request: Pick<GenerateJsonRequest<unknown>, 'temperature' | 'topP' | 'topK'>,
): void {
  assertSupported(selection, request, {
    prices: MODEL_PRICES,
    rejectsSamplingParameters: REJECTS_SAMPLING_PARAMETERS,
  })
}

/**
 * A single model call returning JSON validated against the request's schema, on whichever provider
 * the caller selected. Every billed-but-unusable answer is a `ModelProviderError` carrying its
 * billed response.
 */
/* no-mistakes: integration=anthropic */
/* no-mistakes: integration=openai */
export async function generateJson<T>(
  selection: ModelSelection,
  request: GenerateJsonRequest<T>,
  options: GenerateJsonOptions,
): Promise<ModelCallResult<T>> {
  assertSupportedRequest(selection, request)
  if (selection.provider === 'anthropic') {
    const createMessage = options.deps?.createMessage ?? createAnthropicMessage
    return callAnthropicJson(createMessage, selection.model, request, options.signal)
  }
  const create = openAIResponseCreator(options.openaiTransport, options.deps)
  return callOpenAIJson(create, selection.model, options.openaiTransport, request)
}
