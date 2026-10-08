import { callAnthropicJson, type AnthropicDeps } from './anthropic-generate.mts'
import { ModelProviderError } from './errors.mts'
import { callOpenAIJson, type OpenAIDeps } from './openai-generate.mts'
import { isPricedModel, normalizeModelAlias } from './pricing.mts'
import type {
  GenerateJsonRequest,
  ModelCallResult,
  ModelSelection,
  OpenAITransport,
} from './types.mts'

/** Models that return a 400 for any non-default `temperature`, `top_p` or `top_k`. */
const REJECTS_SAMPLING_PARAMETERS = new Set(['anthropic:claude-haiku-5-5'])

export type GenerateJsonOptions = {
  /** The global OpenAI transport setting; read by the agent layer, never chosen per agent. */
  openaiTransport: OpenAITransport
  signal?: AbortSignal
  deps?: AnthropicDeps & OpenAIDeps
}

function unsupported(message: string): ModelProviderError {
  return new ModelProviderError('unsupported-parameter', message, { retryClass: 'permanent' })
}

/**
 * Rejects what a model cannot take before any request is sent, so a bad configuration fails fast
 * and unbilled instead of as a provider 400. An unpriced model is rejected too: its calls would be
 * recorded unpriced, which the spend cap treats as a breach.
 */
export function assertSupportedRequest(
  selection: ModelSelection,
  request: Pick<GenerateJsonRequest<unknown>, 'temperature' | 'topP' | 'topK'>,
): void {
  if (!isPricedModel(selection.provider, normalizeModelAlias(selection.model)))
    throw unsupported(`${selection.provider} model '${selection.model}' has no price row.`)
  const key = `${selection.provider}:${normalizeModelAlias(selection.model)}`
  if (!REJECTS_SAMPLING_PARAMETERS.has(key)) return
  if (request.temperature !== undefined || request.topP !== undefined || request.topK !== undefined)
    throw unsupported(`${selection.model} does not accept temperature, top_p or top_k.`)
}

/* no-mistakes: integration=anthropic */
/* no-mistakes: integration=openai */
/**
 * A single model call returning JSON validated against the request's schema, on whichever provider
 * the caller selected. Every result carries the served model, response id and provider-neutral
 * usage; every billed-but-unusable answer is a `ModelProviderError` carrying its billed response.
 *
 * @public The agents call it from the next layer of #2370; nothing in this layer does yet.
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
