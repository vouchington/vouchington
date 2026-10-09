import { UnrecoverableError, Worker, type Worker as GlideWorker } from 'glide-mq'
import {
  handleRateLimitedError,
  unrecoverable as markUnrecoverable,
  wrapHttpForRetry as wrapUpstreamHttpForRetry,
} from '@vouchington/queue-errors'
import { getRetryAfterMs, throwRateLimited } from './rate-limit.mts'

export { UnrecoverableError }
export * from './rate-limit.mts'

const BEDROCK_COOLDOWN_MS = 60_000

// Throws an UnrecoverableError, skipping remaining retry attempts.
export function unrecoverable(error: unknown, message?: string): never {
  return markUnrecoverable(error, message, { UnrecoverableError })
}

// Classifies an HTTP failure for glide-mq:
// - a 429 that states its wait (`Retry-After`, or a parsed `retryAfterMs`) requeues the job after
//   that wait without consuming an attempt;
// - AWS throttling is rethrown even though SES reports it as HTTP 400, so the queue retries it;
// - every other 4xx except 408 and 429 becomes an UnrecoverableError;
// - 408, other 429s, and 5xx are rethrown so glide-mq retries them under the job's attempts.
// A 5xx `Retry-After` is deliberately not honored: a requeue is unbounded, and an unreachable host
// that keeps naming a wait would never fail.
export function wrapHttpForRetry(error: unknown): never {
  if (isAwsThrottlingError(error)) throw error
  if (getHttpStatus(error) === 429) {
    const retryAfterMs = getRetryAfterMs(error)
    if (retryAfterMs !== null) throwRateLimited(retryAfterMs, error)
  }
  return wrapUpstreamHttpForRetry(error, { getStatus: getHttpStatus, UnrecoverableError })
}

export async function handleBedrockRateLimit(
  error: unknown,
  worker: Pick<GlideWorker, 'rateLimit'>,
): Promise<never> {
  return handleRateLimitedError(error, worker, {
    cooldownMs: BEDROCK_COOLDOWN_MS,
    isRateLimited: isBedrockRateLimitError,
    onUnhandled: wrapHttpForRetry,
    UnrecoverableError,
    RateLimitError: Worker.RateLimitError,
  })
}

// SES reports "Maximum sending rate exceeded" (and its daily quota) as HTTP 400 with the code
// `Throttling`, so the status alone would classify the throttle as a permanent client error. The
// request was rejected before anything was sent, so retrying cannot duplicate an email.
const AWS_THROTTLING_ERROR_NAMES = new Set(['Throttling', 'ThrottlingException'])
const SES_SENDING_RATE_EXCEEDED = /maximum sending rate exceeded/i

export function isAwsThrottlingError(error: unknown): error is Error {
  return (
    error instanceof Error &&
    (AWS_THROTTLING_ERROR_NAMES.has(error.name) || SES_SENDING_RATE_EXCEEDED.test(error.message))
  )
}

export function isBedrockRateLimitError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const metadata = (error as { $metadata?: { httpStatusCode?: unknown } }).$metadata
  return error.name === 'ThrottlingException' || metadata?.httpStatusCode === 429
}

function getHttpStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const candidate = error as {
    status?: unknown
    statusCode?: unknown
    $metadata?: { httpStatusCode?: unknown }
  }
  if (typeof candidate.status === 'number') return candidate.status
  if (typeof candidate.statusCode === 'number') return candidate.statusCode
  return typeof candidate.$metadata?.httpStatusCode === 'number'
    ? candidate.$metadata.httpStatusCode
    : undefined
}
