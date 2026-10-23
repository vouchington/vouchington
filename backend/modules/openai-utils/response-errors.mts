import type { Response } from 'openai/resources/responses/responses'
import { APIError, APIUserAbortError } from 'openai'
import { walkErrorChain } from './error-chain.mts'

type ResponseUsage = NonNullable<Response['usage']>
export type OpenAIUsage = Pick<ResponseUsage, 'input_tokens' | 'output_tokens'> & {
  input_tokens_details?: Partial<
    Pick<ResponseUsage['input_tokens_details'], 'cached_tokens' | 'cache_write_tokens'>
  >
  output_tokens_details?: Partial<Pick<ResponseUsage['output_tokens_details'], 'reasoning_tokens'>>
  cost?: number
}

/**
 * Thrown by validateCompletedResponse for a terminal-but-not-completed response (failed,
 * incomplete, or another nonterminal status). OpenAI still bills tokens for these — e.g. hitting
 * max_output_tokens — so the usage/model/service_tier the response actually carried are attached
 * here rather than discarded, letting every consumer record the spend before the error propagates.
 */
export class OpenAIResponseNotCompletedError extends Error {
  // Only absent if an OpenResponses provider response body itself omits an id, which should not happen in
  // practice — kept optional rather than defaulted so a missing id is visible, not papered over.
  readonly id?: string
  readonly status: string
  readonly usage?: OpenAIUsage
  readonly model?: Response['model']
  readonly service_tier?: Response['service_tier']
  // OpenAI's error taxonomy for a 'failed' response (e.g. 'invalid_prompt', 'server_error').
  readonly code?: string
  // OpenAI's incomplete-details taxonomy for an 'incomplete' response (e.g. 'max_output_tokens').
  readonly reason?: string

  constructor(message: string, response: Response) {
    super(message)
    this.id = response.id || undefined
    this.status = response.status ?? 'missing'
    this.usage = response.usage
    this.model = response.model
    this.service_tier = response.service_tier
    this.code = response.error?.code ?? undefined
    this.reason = response.incomplete_details?.reason ?? undefined
  }
}

/**
 * Thrown when the SSE stream for a response dies part-way through iteration. `emittedTextDelta`
 * records whether any text had already reached the caller: `false` means the attempt produced
 * nothing at all, which is the signature of upstream/edge weather rather than a defect in how we
 * consume the stream. The field preserves this distinction for callers without parsing prose.
 */
export class OpenAIResponseStreamIterationError extends Error {
  readonly emittedTextDelta: boolean

  constructor(emittedTextDelta: boolean, options: { cause: unknown }) {
    const timing = emittedTextDelta
      ? 'after at least one text delta was emitted'
      : 'before any text delta was emitted'
    super(`OpenAI response stream iteration failed ${timing}`, options)
    this.emittedTextDelta = emittedTextDelta
  }
}

const FLEX_CAPACITY_FAILURE_PATTERN = /flex processing is temporarily unavailable/i

/**
 * True for the streamed form of flex capacity unavailability: a `response.failed` event carrying
 * `server_error` "Flex processing is temporarily unavailable. Please try again later or use
 * standard processing." and no usage. It is the same capacity condition as the HTTP 429
 * `resource_unavailable` (see `isOpenAIFlexResourceUnavailableError`) — the provider rejected the
 * flex request before processing it — so it is likewise treated as not billed. Any usage on the
 * response makes the failure billable and keeps it on the ledger-recording path instead.
 */
export function isOpenAIFlexCapacityFailedResponseError(error: unknown): boolean {
  return (
    error instanceof OpenAIResponseNotCompletedError &&
    error.status === 'failed' &&
    error.code === 'server_error' &&
    error.usage == null &&
    FLEX_CAPACITY_FAILURE_PATTERN.test(error.message)
  )
}

/**
 * True when a physical attempt may have been billed but left no authoritative usage.
 * `previous_response_not_found` is a deterministic unbilled rejection that chat recovers from, and a
 * flex capacity failure is positively unbilled. A terminal failed/incomplete/cancelled response
 * only needs the latch when usage is absent — otherwise `recordAgentResponseUsage` writes the
 * ledger row from the error.
 */
export function shouldLatchUnknownBilledOpenAIAttempt(error: unknown): boolean {
  if (isOpenAIMissingPreviousResponseError(error)) return false
  if (isOpenAIFlexCapacityFailedResponseError(error)) return false
  if (isExplicitClientCancelError(error)) return false
  if (error instanceof OpenAIResponseNotCompletedError) return error.usage == null
  return true
}

export function isExplicitClientCancelError(error: unknown): boolean {
  return walkErrorChain(error, current => {
    if (current instanceof APIUserAbortError) return true
    return current instanceof Error && current.name === 'AbortError'
  })
}

export function isOpenAIMissingPreviousResponseError(error: unknown): boolean {
  return walkErrorChain(error, current => {
    return (
      current instanceof APIError &&
      (current.status === 400 || current.status === undefined) &&
      current.code === 'previous_response_not_found' &&
      current.param === 'previous_response_id'
    )
  })
}

/** A 404 from OpenAI: a response id past its retrieval retention window, or one that never existed. */
export function isOpenAINotFoundError(error: unknown): boolean {
  return error instanceof APIError && error.status === 404
}
