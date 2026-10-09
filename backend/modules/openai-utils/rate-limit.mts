import { APIError, RateLimitError } from 'openai'
import type { Job } from 'glide-mq'
import {
  clampRateLimitDelayMs,
  deferJobForRateLimit,
  throwRateLimited,
} from '@modules/queue-errors'
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
 * per-request-retry compounding math in the private vouchington/vouchington-docs repository:
 * retries against this error are free, retries against any other rate-limit/server error are not.
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

/** Returns true for transient server errors on the OpenAI API (e.g. flex-tier 5xx).
 *  Responses API calls disable SDK retries and treat these as accounting-ambiguous. *
 * @public Documented contract; production use is unconfirmed and this export may be
 * removed after intended-use review. Evidence: `docs/overview/architecture/backend/modules/openai-utils/README.md`.
 */
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
    if (durationMs !== null) return durationMs
  }
  return 60 * 1000
}

/** How long, in ms, a job that hit this 429 should wait: the clamped `Retry-After`, else a minute. */
export function getOpenAIRateLimitDelayMs(error: unknown): number {
  return clampRateLimitDelayMs(getRetryAfterDuration(error))
}

/**
 * Requeues the current job after the provider's `Retry-After` (a minute when it sent none) without
 * consuming an attempt. The wait travels with the job, so every replica that receives a 429 honors
 * it. A worker with a `limiter` also idles itself for that wait: use this on a queue whose jobs
 * all need OpenAI, and `deferJobForOpenAIRateLimit` where provider-free jobs share the worker.
 */
export async function handleOpenAIRateLimit(error: unknown): Promise<never> {
  assertOpenAIRateLimit(error)
  return throwRateLimited(getOpenAIRateLimitDelayMs(error), error)
}

/** Parks only the current job for the provider's `Retry-After`; other jobs keep running. */
export async function deferJobForOpenAIRateLimit(
  error: unknown,
  job: Pick<Job, 'moveToDelayed'>,
): Promise<never> {
  assertOpenAIRateLimit(error)
  return deferJobForRateLimit(job, getOpenAIRateLimitDelayMs(error))
}

function assertOpenAIRateLimit(error: unknown): void {
  if (isOpenAIRateLimitError(error)) return
  throw error instanceof Error
    ? error
    : new Error('OpenAI rate limit handling failed', { cause: error })
}
