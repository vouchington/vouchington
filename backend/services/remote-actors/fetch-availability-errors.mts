import { isTimeoutError } from '@modules/utils/http'

export class RemoteActorFetchAvailabilityError extends Error {
  readonly status = 502
  readonly statusCode = 502
  readonly expose = true

  constructor(message: string, cause?: unknown) {
    super(message, { cause })
    this.name = 'RemoteActorFetchAvailabilityError'
  }
}

const DNS_RESOLUTION_ERROR_CODES = new Set(['EAI_AGAIN', 'ENOTFOUND'])
const RESPONSE_BODY_TRANSPORT_ERROR_CODES = new Set(['UND_ERR_BODY_TIMEOUT', 'UND_ERR_SOCKET'])
const FETCH_TRANSPORT_ERROR_CODES = new Set([
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
  'ETIMEDOUT',
  'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_SOCKET',
])

// isTimeoutError below is a policy choice, not a mechanical substitution:
// RemoteActorFetchAvailabilityError is the fail-OPEN branch (get-or-fetch.mts serves a 7-day
// stale key on it), while fetch-remote-actor-document.mts's parse/validation failures stay
// fail-CLOSED. Only the DNS/SSRF resolution, request, and response-body-download *timeout*
// shapes (ssrf-guard's `AbortError`, and fetchWithTimeout's `DOMException` named `TimeoutError`)
// are intended to widen into this fail-open branch. Two shapes are deliberately excluded:
// - An oversize body (MAX_BODY_BYTES overflow, attacker-controllable) throws HttpResponseSizeError
//   from http-body.mts, a distinct class matching neither AbortError nor TimeoutError, so it stays
//   fail-closed rather than becoming a stale-key hit.
// - There is no caller-initiated cancellation path into isResponseBodyTransportError:
//   fetchRemoteActorDocument calls fetchWithTimeout with no `signal`, so `responseSignal` is
//   exactly the bare timeout DOMException (http.mts only AbortSignal.anys in a caller signal when
//   one is passed) — the only abort reason isTimeoutError can see here is a real timeout.
export function isFetchTransportError(error: unknown): boolean {
  // Node's Fetch implementation delegates to Undici and reports remote transport failures as
  // TypeError('fetch failed', { cause: { code } }). Keep this allowlist fail-closed: Undici upgrades
  // that introduce a new retryable code require explicit review and regression coverage here.
  if (isTimeoutError(error)) return true
  if (!(error instanceof TypeError) || error.message !== 'fetch failed') return false
  return FETCH_TRANSPORT_ERROR_CODES.has(getErrorCode(error.cause) ?? '')
}

export function isDnsResolutionAvailabilityError(error: unknown): boolean {
  return isTimeoutError(error) || DNS_RESOLUTION_ERROR_CODES.has(getErrorCode(error) ?? '')
}

export function isResponseBodyTransportError(error: unknown): boolean {
  if (isTimeoutError(error)) return true
  return (
    error instanceof TypeError &&
    error.message === 'terminated' &&
    RESPONSE_BODY_TRANSPORT_ERROR_CODES.has(getErrorCode(error.cause) ?? '')
  )
}

function getErrorCode(error: unknown): string | null {
  if (!(error instanceof Error)) return null
  const code = (error as Error & { code?: unknown }).code
  return typeof code === 'string' ? code : null
}
