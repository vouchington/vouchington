import type { ResolvedSafeAddress } from 'ssrf-guard'
import {
  getHeaderValue,
  isRetryableNetworkError,
  parseRetryAfter,
} from '@jongleberry/api-server/http-retry'
import { HttpRateLimitError, HttpServerError } from '@modules/on-error/errors'
import onError from '@modules/on-error'
import undici from 'undici'
import { getExternalRequestDispatcher, getPinnedRequestDispatcher } from './http-dispatchers.mts'
export {
  readResponseBody,
  readResponseBodyAsBuffer,
  type ReadResponseBodyOptions,
} from './http-body.mts'

export { getHeaderValue }
export const getRetryAfterDurationMs = parseRetryAfter

export function isNetworkError(error?: unknown): boolean {
  return (error instanceof Error && error.name === 'TimeoutError') || isRetryableNetworkError(error)
}

/**
 * Checks whether an error represents an aborted/timed-out operation.
 * `AbortSignal.timeout()` aborts `fetch` with a `DOMException` named `TimeoutError`; an aborted
 * `node:stream/promises` `pipeline` (and some hand-rolled `AbortController.abort()` sites) surface
 * `AbortError` instead. Accept both names — a predicate that checks only one silently misclassifies
 * the other as a generic network error.
 */
export function isTimeoutError(error: unknown): error is Error {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')
}

/**
 * Checks if an error is retryable.
 * Returns true for network errors and 5xx server errors.
 */
export const isRetryableError = (error: unknown, status?: number): boolean => {
  if (status !== undefined && status >= 500 && status < 600) {
    return true
  }
  return isNetworkError(error)
}

/**
 * True for HTTP statuses where the provider may have already billed the request despite the
 * response failing: 408 (request timeout) and 409 (conflict, often a racing/duplicate write) can
 * both follow a request the provider still processed; 429 (rate limit) and every 5xx can too.
 * Shared by the OpenAI response-retry loop (`@modules/openai-utils/response-retry.mts`) and the
 * structured-decision client (`@modules/structured-decisions/client.mts`) so both classify "was
 * this attempt possibly billed" identically instead of hand-copying the status list.
 */
export function isAmbiguousBilledHttpStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500
}

/**
 * Simple fetch with timeout (no tracking or special error handling).
 * Useful for simple requests like robots.txt.
 *
 * Unlike `fetchWithTimeout` below, this does not split request/response-body phases — one
 * timeout covers the whole call. That is fine for small, one-shot fetches; callers with a
 * download phase worth budgeting separately (the crawler pipeline) use `fetchWithTimeout`.
 */
/* no-mistakes: integration=http */
export const fetchWithTimeoutSimple = async (url: string, timeoutMs: number): Promise<Response> => {
  const response = await undici.fetch(url, {
    dispatcher: getExternalRequestDispatcher(),
    signal: AbortSignal.timeout(timeoutMs),
  })
  // Ambient and package `Response` declarations have version-skewed types but describe the
  // same Undici-backed WHATWG runtime object (see http-dispatchers.mts), so this cast has no
  // behavioral effect. Needed for programs that also load the "dom" lib (playwright,
  // integration-tests), where the ambient global `Response` resolves to lib.dom's incompatible
  // type instead of undici's — the two types don't overlap enough for a direct assertion.
  return response as unknown as Response
}

export interface FetchWithTimeoutOptions {
  url: string
  headers: Record<string, string>
  /** Bounds DNS + connect + sending the request + receiving response headers. Does not cover
   *  the body download — that phase gets its own budget, returned as `responseSignal`. */
  requestTimeoutMs: number
  /** Bounds the body-download phase. The clock starts once headers arrive, not at request start. */
  responseTimeoutMs: number
  signal?: AbortSignal
  /** Pre-resolved DNS addresses from SSRF validation. Pins the connection
   *  to these addresses, eliminating the TOCTOU window between check and fetch. */
  resolvedAddresses?: ResolvedSafeAddress[]
}

export interface FetchWithTimeoutResult {
  response: Response
  /** Armed once headers arrive; bounds body consumption to `responseTimeoutMs`. Callers must
   *  thread this into whatever reads the body (`readResponseBodyAsBuffer`, a `pipeline`, etc.) —
   *  without it, body reads fall back to undici's much longer default `bodyTimeout`. */
  responseSignal: AbortSignal
}

/**
 * Fetches a URL with independent request-phase and response-phase timeouts, and error handling.
 * Returns the Response paired with a body-phase signal, or throws an appropriate error.
 *
 * The request-phase timer bounds DNS/connect/headers only — it is cleared as soon as `fetch`
 * settles, so a fast request never eats into the download's budget and a slow download never
 * inherits leftover request budget. The two phases are deliberately independent, not a divided
 * shared budget.
 *
 * This is a pure utility function without metrics tracking.
 * For crawler-specific usage with metrics, use @services/crawler-utils.
 */
/* no-mistakes: integration=http */
export const fetchWithTimeout = async (
  options: FetchWithTimeoutOptions,
): Promise<FetchWithTimeoutResult> => {
  const { url, headers, requestTimeoutMs, responseTimeoutMs, resolvedAddresses, signal } = options

  const dispatcher = resolvedAddresses?.length
    ? getPinnedRequestDispatcher(resolvedAddresses)
    : getExternalRequestDispatcher()

  const requestController = new AbortController()
  const requestTimer = setTimeout(
    () =>
      requestController.abort(
        new DOMException('The operation was aborted due to timeout', 'TimeoutError'),
      ),
    requestTimeoutMs,
  )
  try {
    const requestSignal = signal
      ? AbortSignal.any([requestController.signal, signal])
      : requestController.signal

    const response = await undici.fetch(url, {
      dispatcher,
      headers,
      signal: requestSignal,
      redirect: 'manual',
    })

    // The request phase is done — arm a fresh, independent timer for the body. Starting it here
    // (rather than at request start) means a slow-to-connect-but-fast-to-download server doesn't
    // have its download budget eaten by connection setup, and vice versa.
    const responseTimeoutSignal = AbortSignal.timeout(responseTimeoutMs)
    const responseSignal = signal
      ? AbortSignal.any([responseTimeoutSignal, signal])
      : responseTimeoutSignal

    // See the cast comment in fetchWithTimeoutSimple above.
    return { response: response as unknown as Response, responseSignal }
  } finally {
    clearTimeout(requestTimer)
  }
}

export interface HandleHttpErrorsOptions {
  response: Response
  url: string
}

function cancelResponseBody(response: Response): void {
  const cancellation = response.body?.cancel()
  if (cancellation) {
    // Cancellation is best-effort cleanup; preserve the HTTP error outcome.
    void cancellation.catch(onError)
  }
}

/**
 * Checks HTTP status codes and throws an error if needed.
 * Throws for 429 (rate limit) and 5xx (server errors).
 *
 * This is a pure utility function without metrics tracking.
 * For crawler-specific usage with metrics, use @services/crawler-utils.
 */
/* no-mistakes: integration=http */
export const handleHttpErrors = (options: HandleHttpErrorsOptions): void => {
  const { response, url } = options

  if (response.status === 429) {
    cancelResponseBody(response)
    const retryAfterMs = getRetryAfterDurationMs(response.headers.get('retry-after'))
    throw new HttpRateLimitError(url, response.status, retryAfterMs)
  }
  if (response.status >= 500) {
    cancelResponseBody(response)
    throw new HttpServerError(url, response.status)
  }
}
