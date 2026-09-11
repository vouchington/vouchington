import { UnrecoverableError, Worker, type Worker as GlideWorker } from 'glide-mq'
import {
  handleRateLimitedError,
  unrecoverable as markUnrecoverable,
  wrapHttpForRetry as wrapUpstreamHttpForRetry,
} from '@vouchington/queue-errors'

export { UnrecoverableError }

const BEDROCK_COOLDOWN_MS = 60_000

// Throws an UnrecoverableError, skipping remaining retry attempts.
export function unrecoverable(error: unknown, message?: string): never {
  return markUnrecoverable(error, message, { UnrecoverableError })
}

// Converts 4xx HTTP errors (except 408 timeout and 429 rate-limit) to UnrecoverableError.
// 408, 429, and 5xx are rethrown so glide-mq retries them normally.
export function wrapHttpForRetry(error: unknown): never {
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
