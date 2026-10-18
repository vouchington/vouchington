import { Worker } from 'glide-mq'
import { throwRateLimited } from '@vouchington/queue-errors'
import { HttpRateLimitError } from '@modules/on-error/errors'
import { cancelResponseBody, getHeaderValue, getRetryAfterDurationMs } from '@modules/utils/http'

type HeaderSource = Parameters<typeof getHeaderValue>[0]

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
  throwRateLimited(retryAfterMs, new HttpRateLimitError(endpoint, response.status, retryAfterMs), {
    RateLimitError: Worker.RateLimitError,
  })
}
