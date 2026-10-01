import type { fetch as undiciFetch, Response } from 'undici'
export type StructuredDecisionTransport = 'openrouter' | 'typesafe'
export type NoulQuestion = { id: string; type: 'noul'; question: string }
export type ChoiceQuestion = {
  id: string
  type: 'choice'
  question: string
  criteria: readonly string[]
}
export type ScoreCriterion = { description: string; value: number }
export type ScoreQuestion = {
  id: string
  type: 'score'
  question: string
  criteria: readonly ScoreCriterion[]
}
export type StructuredDecisionQuestion = NoulQuestion | ChoiceQuestion | ScoreQuestion
export type StructuredDecisionRequest = {
  state: string
  questions: readonly StructuredDecisionQuestion[]
}
export type StructuredDecisionNativeAnswer = Readonly<Record<string, unknown>>
export type NoulAnswer = {
  id: string
  type: 'noul'
  probability: number
  raw: StructuredDecisionNativeAnswer
}
export type ChoiceAnswer = {
  id: string
  type: 'choice'
  choice: string
  confidence: number
  probabilities: Readonly<Record<string, number>>
  raw: StructuredDecisionNativeAnswer
}
export type ScoreAnswer = {
  id: string
  type: 'score'
  score: number
  confidence: number
  legend: readonly string[]
  probabilities: Readonly<Record<string, number>>
  raw: StructuredDecisionNativeAnswer
}
export type StructuredDecisionAnswer = NoulAnswer | ChoiceAnswer | ScoreAnswer
export type StructuredDecisionResult = {
  answers: readonly StructuredDecisionAnswer[]
  model: string
  provider: string
  raw: unknown
  usage: Readonly<Record<string, unknown>> | null
}
export type StructuredDecisionErrorCode = 'invalid-request' | 'invalid-response' | 'provider-error'
/** Whether the same request may succeed later (`transient`) or never will (`permanent`). */
export type StructuredDecisionRetryClass = 'transient' | 'permanent'
/**
 * What a provider's error body says, bounded and free of echoed user content. `flagged_input` and
 * every metadata value outside the named keys are dropped before anything is kept.
 */
export type ProviderErrorDetail = {
  code?: number | string
  providerMessage?: string
  errorType?: string
  providerCode?: string
  reasons?: readonly string[]
  providerName?: string
  modelSlug?: string
  limitSource?: string
  /** The provider's content-moderation flag fired (`reasons` or `flagged_input` was present). */
  moderation: boolean
  /** The provider's guardrail block fired (`patterns` was present). */
  guardrail: boolean
}
export type StructuredDecisionProviderFailure = {
  retryClass: StructuredDecisionRetryClass
  /** Honoured from `Retry-After`, in milliseconds. */
  retryAfterMs?: number
  detail?: ProviderErrorDetail
}
export class StructuredDecisionError extends Error {
  readonly code: StructuredDecisionErrorCode
  readonly status: number | undefined
  /** Set on every `provider-error`: the shared retry classification and the safe error detail. */
  readonly retryClass: StructuredDecisionRetryClass | undefined
  readonly retryAfterMs: number | undefined
  readonly detail: ProviderErrorDetail | undefined

  constructor(
    code: StructuredDecisionErrorCode,
    message: string,
    status?: number,
    options?: ErrorOptions & { failure?: StructuredDecisionProviderFailure },
  ) {
    super(message, options)
    this.name = 'StructuredDecisionError'
    this.code = code
    this.status = status
    this.retryClass = options?.failure?.retryClass
    this.retryAfterMs = options?.failure?.retryAfterMs
    this.detail = options?.failure?.detail
  }
}
export type StructuredDecisionFetch = (
  url: string,
  init: Parameters<typeof undiciFetch>[1],
) => Promise<Response>
// Mirrors the OpenRouter/Jev billing shape (id, usage.input_tokens/output_tokens/cost) that
// the Decisions API and Jev guide document, kept local rather than importing OpenAI's
// `OpenAIUsage` type -- this module has no other dependency on `@modules/openai-utils`, and the
// two shapes only coincide because both providers happen to use the same field names.
export type StructuredDecisionUsage = {
  input_tokens: number
  output_tokens: number
  cost?: number
}
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
export type CreateStructuredDecisionClientOptions = {
  transport: StructuredDecisionTransport
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
