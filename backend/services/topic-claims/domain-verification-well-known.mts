import { fetchWithTimeout, reportHttpTransportError } from '@modules/utils/http'
import { withAbortableBody } from '@vouchington/http-transport/fetch'
import { validateUrl } from 'ssrf-guard/node'
import { fetchWellKnownText, type SecureHttpTransport } from '@vouchington/domain-verification'

const MAX_BODY_BYTES = 4096
const FETCH_TIMEOUT_MS = 10000
// ssrf-guard@1.0.0's validateUrl short-circuits to no timeout when both `signal` and `timeoutMs`
// are undefined (mirrors crawl-url/safety.mts:9-12's DEFAULT_DNS_TIMEOUT_MS), so this option is
// mandatory, not a tuning knob.
const DNS_TIMEOUT_MS = 5000

/**
 * Fetches the verification token from a claimant-controlled domain.
 * SSRF-guarded: the hostname is resolved and validated against private/loopback ranges
 * before any request, and the connection is pinned to the validated addresses.
 */
/* no-mistakes: integration=http */
export async function fetchWellKnownToken(hostname: string): Promise<string | null> {
  const transport: SecureHttpTransport = {
    async get(url, options) {
      const resolvedAddresses = await validateUrl(url, { timeoutMs: DNS_TIMEOUT_MS })
      const { response, responseSignal } = await fetchWithTimeout({
        url,
        headers: options.headers,
        requestTimeoutMs: options.timeoutMs,
        responseTimeoutMs: options.timeoutMs,
        resolvedAddresses,
      })
      // SecureHttpTransport.get must return a bare Response — @vouchington/domain-verification
      // reads the body itself with no signal parameter of its own — so the body-phase timeout
      // is applied by wrapping the body stream to abort once responseSignal fires.
      return withAbortableBody(response, responseSignal, { onError: reportHttpTransportError })
    },
  }
  try {
    return await fetchWellKnownText(hostname, {
      path: '/.well-known/voucha-verification.txt',
      transport,
      timeoutMs: FETCH_TIMEOUT_MS,
      maxBytes: MAX_BODY_BYTES,
    })
  } catch {
    // Invalid hostnames, SSRF rejections, and network errors all mean verification failed.
    // Upstream @vouchington/domain-verification's well-known.mjs wraps the whole transport.get()
    // call in try { … } catch { return null }, so a validateUrl DNS-timeout rejection never
    // reaches this catch either — it is swallowed one layer up. Bounding DNS_TIMEOUT_MS above
    // only changes how long that swallow takes to happen, not this function's return value.
    return null
  }
}
