import type { fetch as undiciFetch, Response } from 'undici'
import type {
  StructuredDecisionRequest,
  StructuredDecisionResult,
  StructuredDecisionUsage,
} from '@vouchington/ai/structured-decisions'
export type StructuredDecisionTransport = 'openai' | 'openrouter' | 'typesafe'
export type StructuredDecisionFetch = (
  url: string,
  init: Parameters<typeof undiciFetch>[1],
) => Promise<Response>
export type StructuredDecisionAttempt = { requestStartedAt: Date }
// `id`/`model` are passed through exactly as the provider sent them (or `undefined` if absent) --
// the client only validates that `usage` is well-formed enough to be worth recording; a caller
// that needs a trustworthy id/model coerces these itself. Usage recording does not require an id.
export type StructuredDecisionBilledResponse = {
  id: unknown
  model: unknown
  usage: StructuredDecisionUsage
  transport: StructuredDecisionTransport
  requestStartedAt: Date
}
export interface StructuredDecisionAttemptHooks {
  /** Called once, immediately before the physical request. The client makes exactly one attempt
   *  per `decide()` call, so this is the only checkpoint available to recheck a billing
   *  precondition (e.g. the daily spend cap) close to the actual network call. */
  beforeAttempt?: (attempt: StructuredDecisionAttempt) => Promise<void>
  /** Fires for every 2xx response, from the raw parsed body, before `decodeResult`'s strict
   *  validation runs -- so a 2xx that fails strict decoding still reports the usage it billed. */
  onBilledResponse?: (response: StructuredDecisionBilledResponse) => Promise<void>
}
/**
 * The `{ provider, model }` a classifier entry point takes: the classifier row's transport and
 * decision model, which stay its single source because its thresholds are calibrated per model.
 */
export type StructuredDecisionModelSelection = {
  provider: StructuredDecisionTransport
  model: string
}
export type CreateStructuredDecisionClientOptions = {
  transport: StructuredDecisionTransport
  /** The decision model to ask; each transport's own default model when omitted. */
  model?: string
  apiKey: string
  fetch?: StructuredDecisionFetch
  hooks?: StructuredDecisionAttemptHooks
}
export type StructuredDecisionClient = {
  decide(
    request: StructuredDecisionRequest,
    signal?: AbortSignal,
  ): Promise<StructuredDecisionResult>
}
