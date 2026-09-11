import { AutoHarnessError, AutoHarnessRequestTimeoutError } from 'auto-harness-client'

// 408 (Request Timeout) means the server itself gave up waiting on the request and did not
// process it, so it is as safe to retry as the client-side AutoHarnessRequestTimeoutError case.
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504])
const RETRY_DELAY_MS = 500

export function isRetryableDispatchError(error: unknown): boolean {
  if (error instanceof AutoHarnessError) {
    return RETRYABLE_STATUSES.has(error.status)
  }
  if (error instanceof AutoHarnessRequestTimeoutError) {
    return true
  }
  // A fetch() implementation rejects with a TypeError for network-level failures
  // (DNS, connection reset, etc.), distinct from an HTTP error response.
  return error instanceof TypeError
}

function retryDelayMs(error: unknown): number {
  if (error instanceof AutoHarnessError && error.retryAfter !== undefined) {
    // RFC 7231 §7.1.3 allows Retry-After to be either delay-seconds or an HTTP-date; the
    // client library passes the header through unparsed, so both forms reach us verbatim.
    const seconds = Number(error.retryAfter)
    if (Number.isFinite(seconds) && seconds >= 0) {
      return seconds * 1000
    }
    const untilMs = Date.parse(error.retryAfter)
    if (Number.isFinite(untilMs)) {
      return Math.max(untilMs - Date.now(), 0)
    }
  }
  return RETRY_DELAY_MS
}

/**
 * Retries a single Auto Harness client operation (e.g. one `createSession` or
 * `resumeSession` call) once on a transient failure.
 *
 * This wraps the whole operation rather than the underlying fetch: each
 * AutoHarnessClient method call gets its own independent request timeout
 * internally, so a fetch-level retry couldn't observe a timeout and would
 * share a single timeout budget across both attempts. Retrying the operation
 * gives the retried attempt a fresh budget, matching how a human re-running
 * the step would behave.
 */
export async function withSingleRetry<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (!isRetryableDispatchError(error)) {
      throw error
    }
    await new Promise(resolve => setTimeout(resolve, retryDelayMs(error)))
    return operation()
  }
}
