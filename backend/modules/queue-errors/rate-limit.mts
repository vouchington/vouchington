import { Worker, type Job } from 'glide-mq'
import { HttpRateLimitError } from '@modules/on-error/errors'
import { cancelResponseBody, getHeaderValue, getRetryAfterDurationMs } from '@modules/utils/http'

/**
 * Floor for a deferral. GlideMQ replaces a falsy `delayMs` with the worker limiter's duration (or
 * one second), so a provider's `Retry-After: 0` could otherwise requeue the job at that unrelated
 * pace. One second also keeps a provider that always answers `0` from becoming a hot loop.
 */
export const MIN_RATE_LIMIT_DELAY_MS = 1_000
/** Used when the provider is rate limited but states no wait. */
export const DEFAULT_RATE_LIMIT_DELAY_MS = 60_000
/**
 * Ceiling for a deferral. A requeue never consumes an attempt, so a provider that asks for a
 * longer wait is polled again at this pace instead of parking the job for hours.
 */
export const MAX_RATE_LIMIT_DELAY_MS = 15 * 60_000

type DeferrableJob = Pick<Job, 'moveToDelayed'>
type HeaderSource = Parameters<typeof getHeaderValue>[0]

/** Clamps a provider's `Retry-After` into the supported window; `null`/missing uses the default. */
export function clampRateLimitDelayMs(retryAfterMs?: number | null): number {
  if (retryAfterMs === undefined || retryAfterMs === null || !Number.isFinite(retryAfterMs)) {
    return DEFAULT_RATE_LIMIT_DELAY_MS
  }
  return Math.min(
    MAX_RATE_LIMIT_DELAY_MS,
    Math.max(MIN_RATE_LIMIT_DELAY_MS, Math.ceil(retryAfterMs)),
  )
}

/**
 * Builds GlideMQ's rate-limit control-flow signal. The worker requeues the job after `delayMs`
 * without consuming an attempt. Every replica that receives a 429 raises its own signal, so unlike
 * `worker.rateLimit()` the wait is carried by the job and not by one process's memory. A worker
 * with a `limiter` also idles itself for `delayMs`, so only raise this on a queue whose other jobs
 * need the same provider; otherwise use `deferJobForRateLimit`.
 *
 * `Worker.RateLimitError` takes no constructor arguments; GlideMQ reads `delayMs` off the instance.
 */
export function createRateLimitError(retryAfterMs?: number | null, cause?: unknown) {
  const error = Object.assign(new Worker.RateLimitError(), {
    delayMs: clampRateLimitDelayMs(retryAfterMs),
  })
  if (cause !== undefined) error.cause = cause
  return error
}

/** Throws the rate-limit signal; see `createRateLimitError`. */
export function throwRateLimited(retryAfterMs?: number | null, cause?: unknown): never {
  // oxlint-disable-next-line typescript/only-throw-error -- GlideMQ requires this control-flow signal to defer the job.
  throw createRateLimitError(retryAfterMs, cause)
}

/**
 * Parks only this job for the provider's wait, without consuming an attempt and without idling the
 * worker. Use it on a queue that mixes provider-bound jobs with provider-free ones (reconcilers),
 * which a worker-level pause would also hold back. `moveToDelayed` always rejects with GlideMQ's
 * `DelayedError`, which the worker turns into the delayed requeue.
 */
export function deferJobForRateLimit(
  job: DeferrableJob,
  retryAfterMs?: number | null,
): Promise<never> {
  return job.moveToDelayed(Date.now() + clampRateLimitDelayMs(retryAfterMs))
}

/**
 * Reads the wait a provider asked for from a failure: a parsed `retryAfterMs` field (the shape of
 * `HttpRateLimitError`) or a `Retry-After` header on `headers` (fetch `Headers`, a Node header map,
 * or an SDK error's header bag). Returns `null` when the provider named no usable wait.
 */
export function getRetryAfterMs(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) return null
  const { retryAfterMs, headers } = error as { retryAfterMs?: unknown; headers?: HeaderSource }
  if (typeof retryAfterMs === 'number' && Number.isFinite(retryAfterMs) && retryAfterMs >= 0) {
    return retryAfterMs
  }
  const header = getHeaderValue(headers, 'retry-after')
  return getRetryAfterDurationMs(Array.isArray(header) ? header[0] : header)
}

/**
 * Requeues the job when an upstream response is a 429, keeping the status and the `Retry-After`
 * wait on the signal's `cause` (an `HttpRateLimitError`). `endpoint` names the request without
 * its query string, which can carry credentials. The unread body is cancelled first so sustained
 * throttling cannot hold dispatcher connections while jobs wait. Any other response returns
 * normally and keeps its body for the caller.
 */
export function throwIfRateLimitedResponse(
  response: { status: number; headers: HeaderSource; body?: Response['body'] },
  endpoint: string,
): void {
  if (response.status !== 429) return
  cancelResponseBody(response)
  const retryAfterMs = getRetryAfterMs(response)
  throwRateLimited(retryAfterMs, new HttpRateLimitError(endpoint, response.status, retryAfterMs))
}
