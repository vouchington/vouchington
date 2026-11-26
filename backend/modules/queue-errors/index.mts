import { UnrecoverableError, Worker } from 'glide-mq'
import {
  throwRateLimited,
  wrapHttpForRetry as wrapUpstreamHttpForRetry,
} from '@vouchington/queue-errors'
import { isAwsThrottlingError } from '@vouchington/aws/errors'
import { getRetryAfterMs } from './rate-limit.mts'

export * from './rate-limit.mts'

// Classifies an HTTP failure for glide-mq:
// - a 429 that states its wait (`Retry-After`, or a parsed `retryAfterMs`) requeues the job after
//   that wait without consuming an attempt;
// - AWS throttling is rethrown even though SES reports it as HTTP 400, so the queue retries it;
// - every other 4xx except 408 and 429 becomes an UnrecoverableError;
// - 408, other 429s, and 5xx are rethrown so glide-mq retries them under the job's attempts.
// A 5xx `Retry-After` is deliberately not honored: a requeue is unbounded, and an unreachable host
// that keeps naming a wait would never fail.
export function wrapHttpForRetry(error: unknown): never {
  if (getHttpStatus(error) === 429) {
    const retryAfterMs = getRetryAfterMs(error)
    if (retryAfterMs !== null)
      throwRateLimited(retryAfterMs, error, { RateLimitError: Worker.RateLimitError })
  }
  if (isAwsThrottlingError(error)) throw error
  return wrapUpstreamHttpForRetry(error, { getStatus: getHttpStatus, UnrecoverableError })
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
