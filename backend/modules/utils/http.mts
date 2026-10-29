import { addGracefulShutdownDrainCallback } from '@data-stores/graceful-shutdown'
import onError from '@modules/on-error'
import { HttpRateLimitError, HttpServerError } from '@vouchington/sentry'
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
export const handleHttpErrors = (
  options: Omit<
    Parameters<typeof transport.handleHttpErrors>[0],
    'onError' | 'createRateLimitError' | 'createServerError'
  >,
): void =>
  transport.handleHttpErrors({
    ...options,
    onError: reportError,
    createRateLimitError: (url, status, retryAfterMs) =>
      new HttpRateLimitError(url, status, retryAfterMs),
    createServerError: (url, status) => new HttpServerError(url, status),
  })
