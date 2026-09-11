import type { Response } from 'openai/resources/responses/responses'
import { APIError, APIUserAbortError } from 'openai'

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
  const seen = new Set<unknown>()
  let current: unknown = error

  while (current !== null && (typeof current === 'object' || typeof current === 'function')) {
    if (seen.has(current)) return false
    seen.add(current)
    if (match(current)) return true
    current = 'cause' in current ? current.cause : undefined
  }

  return false
}
