import { addGracefulShutdownDrainCallback } from '@data-stores/graceful-shutdown'
import onError, { recordOffAllowlistEgress } from '@modules/on-error'
import { HttpRateLimitError, HttpServerError } from '@vouchington/sentry'
import {
  createHttpDispatchers,
  createOriginGuardrailInterceptor,
} from '@vouchington/http-transport/dispatchers'
import * as transport from '@vouchington/http-transport/fetch'
import { isExemptEgressHost, isIpv6AllowlistedHost } from './ipv6-allowlist.mts'

export const reportHttpTransportError = (error: unknown): void =>
  onError(error instanceof Error ? error : new Error('HTTP transport failure', { cause: error }))

let apiEgressGuardrailEnabled = false

// Create once and reuse across all dispatchers so per-host Sentry deduplication is shared.
const apiEgressGuardrailInterceptor = createOriginGuardrailInterceptor({
  isExemptHost: isExemptEgressHost,
  isAllowedHost: isIpv6AllowlistedHost,
  onDisallowedOrigin: recordOffAllowlistEgress,
})

/** Enables the API egress guardrail in the API process only; workers need arbitrary IPv4 egress. */
export function enableApiEgressGuardrail(): void {
  apiEgressGuardrailEnabled = true
}

// Single seam for all backend fetch traffic (ast-grep-enforced; no bare global fetch).
const dispatchers = createHttpDispatchers({
  onError: reportHttpTransportError,
  interceptors: () => (apiEgressGuardrailEnabled ? [apiEgressGuardrailInterceptor] : []),
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
  transport.cancelResponseBody(response, reportHttpTransportError)

/* no-mistakes: integration=http */
export const handleHttpErrors = (
  options: Omit<
    Parameters<typeof transport.handleHttpErrors>[0],
    'onError' | 'createRateLimitError' | 'createServerError'
  >,
): void =>
  transport.handleHttpErrors({
    ...options,
    onError: reportHttpTransportError,
    createRateLimitError: (url, status, retryAfterMs) =>
      new HttpRateLimitError(url, status, retryAfterMs),
    createServerError: (url, status) => new HttpServerError(url, status),
  })
