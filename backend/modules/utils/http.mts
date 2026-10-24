import { addGracefulShutdownDrainCallback } from '@data-stores/graceful-shutdown'
import onError from '@modules/on-error'
import { HttpRateLimitError, HttpServerError } from '@modules/on-error/errors'
import { createHttpDispatchers } from '@vouchington/http-transport/dispatchers'
import * as transport from '@vouchington/http-transport/fetch'
import { createEgressGuardrailInterceptor } from './http-egress-guardrail.mts'

const reportError = (error: unknown): void =>
  onError(error instanceof Error ? error : new Error('HTTP transport failure', { cause: error }))

let apiEgressGuardrailEnabled = false

/** Enables the API egress guardrail in the API process only; workers need arbitrary IPv4 egress. */
export function enableApiEgressGuardrail(): void {
  apiEgressGuardrailEnabled = true
}

// Single seam for all backend fetch traffic (ast-grep-enforced; no bare global fetch).
const dispatchers = createHttpDispatchers({
  onError: reportError,
  interceptors: () => (apiEgressGuardrailEnabled ? [createEgressGuardrailInterceptor()] : []),
})

export const {
  getExternalRequestDispatcher,
  getLongRunningExternalRequestDispatcher,
  getPinnedRequestDispatcher,
  getExternalFetch,
  getLongRunningExternalFetch,
  closeHttpDispatchers,
} = dispatchers

addGracefulShutdownDrainCallback(closeHttpDispatchers)

/* no-mistakes: integration=http */
export const fetchWithTimeout = (
  options: Omit<transport.FetchWithTimeoutOptions, 'dispatchers'>,
): Promise<transport.FetchWithTimeoutResult> =>
  transport.fetchWithTimeout({ ...options, dispatchers })

/* no-mistakes: integration=http */
export const fetchWithTimeoutSimple = (url: string, timeoutMs: number): Promise<Response> =>
  transport.fetchWithTimeoutSimple(url, timeoutMs, getExternalRequestDispatcher())

export const cancelResponseBody = (response: Parameters<typeof transport.cancelResponseBody>[0]) =>
  transport.cancelResponseBody(response, reportError)

/* no-mistakes: integration=http */
export const handleHttpErrors = (options: { response: Response; url: string }): void =>
  transport.handleHttpErrors({
    ...options,
    onError: reportError,
    createRateLimitError: (url, status, retryAfterMs) =>
      new HttpRateLimitError(url, status, retryAfterMs),
    createServerError: (url, status) => new HttpServerError(url, status),
  })

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
