import { APIError, RateLimitError } from 'openai'
import { Worker } from 'glide-mq'
import { getHeaderValue, getRetryAfterDurationMs } from '@modules/utils'

export function isOpenAIRateLimitError(error?: unknown): boolean {
  if (error instanceof RateLimitError) {
    return true
  }
  if (error instanceof APIError) {
    return error.status === 429
  }
  return false
}

const FLEX_RESOURCE_UNAVAILABLE_PATTERN = /resource[\s_-]*unavailable/i

/**
 * Returns true for the flex/priority-tier 429 OpenAI returns when no capacity is available for
 * that tier right now (`code: "resource_unavailable"`, message containing "Resource
 * Unavailable"). Unlike a quota/RPM rate limit or a 5xx, this specific 429 is **not billed** —
 * OpenAI never started processing the request. #8155 asks for this distinction to be a named
 * predicate rather than left implicit in a comment, because it changes the queue-attempt ×
 * per-request-retry compounding math in docs/overview/architecture/openai-cost-model.md: retries
 * against this error are free, retries against every other rate-limit/server error are not.
 *
 * The exact error-body shape isn't documented by OpenAI beyond the tier-availability guidance
 * page, so this checks both the parsed `code` field and a case-insensitive match on the message
 * — either resolving away from the bare status-code check `isOpenAIRateLimitError` already does.
 */
export function isOpenAIFlexResourceUnavailableError(error?: unknown): boolean {
  if (!(error instanceof APIError) || error.status !== 429) return false
  if (typeof error.code === 'string' && FLEX_RESOURCE_UNAVAILABLE_PATTERN.test(error.code)) {
    return true
  }
  return FLEX_RESOURCE_UNAVAILABLE_PATTERN.test(error.message)
}

/** Returns true for auth/permission errors that are not recoverable by retrying. */
export function isOpenAIAuthError(error?: unknown): boolean {
  if (error instanceof APIError) {
    return error.status === 401 || error.status === 403
  }
  return false
}

/** Returns true for transient server errors on the OpenAI API (e.g. flex-tier 5xx).
 *  Responses API calls disable SDK retries and treat these as accounting-ambiguous. */
export function isOpenAIServerError(error?: unknown): boolean {
  if (error instanceof APIError) {
    return error.status >= 500
  }
  return false
}

export function getRetryAfterDuration(error: unknown): number {
  if (error instanceof APIError && error.headers) {
    const retryAfter = getHeaderValue(error.headers, 'retry-after')
    const retryAfterStr = Array.isArray(retryAfter) ? retryAfter[0] : retryAfter
    const durationMs = getRetryAfterDurationMs(retryAfterStr)
    if (durationMs) return durationMs
  }
  return 60 * 1000
}

export async function handleOpenAIRateLimit(error: unknown, worker: Worker): Promise<never> {
  if (!isOpenAIRateLimitError(error)) {
    throw error
  }
  const durationMs = getRetryAfterDuration(error)
  await worker.rateLimit(durationMs)
  throw new Worker.RateLimitError()
}
