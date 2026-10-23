import type {
  StructuredDecisionRequest,
  StructuredDecisionResult,
  StructuredDecisionUsage,
} from '@vouchington/ai/structured-decisions'
import type { fetch as undiciFetch, Response } from 'undici'
export type StructuredDecisionTransport = 'openrouter' | 'typesafe'
export type StructuredDecisionFetch = (
  url: string,
  init: Parameters<typeof undiciFetch>[1],
) => Promise<Response>
export type StructuredDecisionAttempt = { requestStartedAt: Date }
export type StructuredDecisionUnknownBilledAttempt = {
  requestStartedAt: Date
  error: unknown
}
// `id`/`model` are passed through exactly as the provider sent them (or `undefined` if absent) --
// the client only validates that `usage` is well-formed enough to be worth recording; a caller
// that needs a trustworthy id/model coerces these itself, the same way OpenAI-side recording
// tolerates a missing response id (`recordAgentResponseUsage`,
// `backend/agents/_shared/record-response-usage.mts`).
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
  /** Fires when the attempt failed in a way that leaves whether the provider billed it
   *  genuinely ambiguous (a network/connection error, an ambiguous HTTP status, or malformed
   *  JSON on an otherwise-2xx response) -- never for an explicit caller cancellation or an
   *  ordinary non-ambiguous 4xx. */
  onUnknownBilledAttempt?: (attempt: StructuredDecisionUnknownBilledAttempt) => Promise<void>
}
/**
 * The `{ provider, model }` a jev classifier entry point takes: the classifier row's transport and
 * jev model, which stay its single source because its thresholds are calibrated per model.
 */
export type StructuredDecisionModelSelection = {
  provider: StructuredDecisionTransport
  model: string
}
export type CreateStructuredDecisionClientOptions = {
  transport: StructuredDecisionTransport
  /** The jev model to ask; each transport's own jev model when omitted. */
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
