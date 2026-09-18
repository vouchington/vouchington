import type { Response } from 'openai/resources/responses/responses'
import { APIConnectionError, APIError, APIUserAbortError } from 'openai'

type ResponseUsage = NonNullable<Response['usage']>
export type OpenAIUsage = Pick<ResponseUsage, 'input_tokens' | 'output_tokens'> & {
  input_tokens_details?: Pick<ResponseUsage['input_tokens_details'], 'cached_tokens'>
}

export class OpenAIResponseStreamError extends Error {
  readonly code: string | null
  readonly param: string | null

  constructor(error: { code: string | null; message: string; param: string | null }) {
    super(`OpenAI response error (${error.code ?? 'unknown'}): ${error.message}`)
    this.code = error.code
    this.param = error.param
  }
}

/**
 * Thrown by validateCompletedResponse for a terminal-but-not-completed response (failed,
 * incomplete, or another nonterminal status). OpenAI still bills tokens for these — e.g. hitting
 * max_output_tokens — so the usage/model/service_tier the response actually carried are attached
 * here rather than discarded, letting every consumer record the spend before the error propagates.
 */
export class OpenAIResponseNotCompletedError extends Error {
  // Only absent if OpenAI's response body itself omits an id, which should not happen in
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
 * consume the stream. Carrying that as a field rather than only inside the message is what lets
 * `describeOpenAIUpstreamFailure` tell the two apart without parsing prose.
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

/** What a tolerated upstream failure was, recorded so a skip stays attributable in CI logs. */
export type OpenAIUpstreamFailure = {
  readonly reason: string
  readonly status?: number
  readonly requestId?: string
  readonly code?: string
}

/**
 * Statuses OpenAI's own SDK retry predicate treats as transient. 404 is deliberately absent: it is
 * only transient in the bodiless form handled separately below.
 */
const TRANSIENT_OPENAI_STATUSES = new Set([408, 409, 429])

/**
 * Describes an error that is the provider being unavailable rather than our code being wrong, or
 * null when the error is ours to own.
 *
 * Live-API integration tests use this to skip instead of fail: an OpenAI outage must not turn a
 * required check red on a PR that cannot have caused it. The classification is deliberately narrow
 * so that the failures which indicate a real regression — a retired model, a rejected key, a
 * changed response shape, a blown timeout budget, a failed assertion — are never tolerated.
 */
export function describeOpenAIUpstreamFailure(error: unknown): OpenAIUpstreamFailure | null {
  // Our own abort or timeout is our budget being exceeded, not the provider being down.
  if (isExplicitClientCancelError(error)) return null
  return findInErrorChain(error, matchUpstreamFailure)
}

function matchUpstreamFailure(current: object): OpenAIUpstreamFailure | null {
  if (current instanceof OpenAIResponseStreamIterationError) {
    // A stream that broke after emitting text may have been cut short by our own consumption.
    if (current.emittedTextDelta) return null
    return { reason: 'the response stream ended before emitting any text' }
  }
  if (current instanceof OpenAIResponseNotCompletedError) {
    if (current.code !== 'server_error') return null
    return { reason: 'OpenAI returned a failed response', code: current.code }
  }
  // Checked before APIError because it extends it and carries no status to match on.
  if (current instanceof APIConnectionError) {
    return { reason: 'the connection to OpenAI failed' }
  }
  if (!(current instanceof APIError) || current.status == null) return null
  const requestId = current.requestID ?? undefined
  if (current.status >= 500 || TRANSIENT_OPENAI_STATUSES.has(current.status)) {
    const code = current.code ?? undefined
    return { reason: `OpenAI returned ${current.status}`, status: current.status, requestId, code }
  }
  // A 404 with no parsed error body came from an edge or gateway, not from the API rejecting the
  // request: every genuine 404 (unknown model, unknown route) carries a JSON body with `code`.
  if (current.status === 404 && current.error === undefined && current.code === undefined) {
    return { reason: 'OpenAI returned a 404 with no error body', status: 404, requestId }
  }
  return null
}

/**
 * True when a physical attempt may have been billed but left no authoritative usage.
 * `previous_response_not_found` is a deterministic unbilled 400 that chat recovers from.
 * A terminal failed/incomplete/cancelled response only needs the latch when usage is absent —
 * otherwise `recordAgentResponseUsage` writes the ledger row from the error.
 */
export function shouldLatchUnknownBilledOpenAIAttempt(error: unknown): boolean {
  if (isOpenAIMissingPreviousResponseError(error)) return false
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
    if (
      current instanceof OpenAIResponseStreamError &&
      current.code === 'previous_response_not_found' &&
      current.param === 'previous_response_id'
    ) {
      return true
    }
    return (
      current instanceof APIError &&
      current.status === 400 &&
      current.code === 'previous_response_not_found' &&
      current.param === 'previous_response_id'
    )
  })
}

function walkErrorChain(error: unknown, match: (current: object) => boolean): boolean {
  return findInErrorChain(error, current => (match(current) ? true : null)) ?? false
}

/** Cycle-safe walk down `cause`, returning the first non-null mapping. */
function findInErrorChain<T>(error: unknown, map: (current: object) => T | null): T | null {
  const seen = new Set<unknown>()
  let current: unknown = error

  while (current !== null && (typeof current === 'object' || typeof current === 'function')) {
    if (seen.has(current)) return null
    seen.add(current)
    const mapped = map(current)
    if (mapped !== null) return mapped
    current = 'cause' in current ? current.cause : undefined
  }

  return null
}
