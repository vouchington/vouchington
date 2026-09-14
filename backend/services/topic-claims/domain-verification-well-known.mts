import { fetchWithTimeout } from '@modules/utils/http'
import onError from '@modules/on-error'
import { validateUrl } from 'ssrf-guard/node'
import { fetchWellKnownText, type SecureHttpTransport } from '@vouchington/domain-verification'

const MAX_BODY_BYTES = 4096
const FETCH_TIMEOUT_MS = 10000
// ssrf-guard@1.0.0's validateUrl short-circuits to no timeout when both `signal` and `timeoutMs`
// are undefined (mirrors crawl-url/safety.mts:9-12's DEFAULT_DNS_TIMEOUT_MS), so this option is
// mandatory, not a tuning knob.
const DNS_TIMEOUT_MS = 5000

type FetchWellKnownTokenDeps = {
  fetchWithTimeout: typeof fetchWithTimeout
  validateUrl: typeof validateUrl
}

const defaultDeps: FetchWellKnownTokenDeps = {
  fetchWithTimeout,
  validateUrl,
}

/**
 * Fetches the verification token from a claimant-controlled domain.
 * SSRF-guarded: the hostname is resolved and validated against private/loopback ranges
 * before any request, and the connection is pinned to the validated addresses.
 */
/* no-mistakes: integration=http */
export async function fetchWellKnownToken(
  hostname: string,
  deps: FetchWellKnownTokenDeps = defaultDeps,
): Promise<string | null> {
  const transport: SecureHttpTransport = {
    async get(url, options) {
      const resolvedAddresses = await deps.validateUrl(url, { timeoutMs: DNS_TIMEOUT_MS })
      const { response, responseSignal } = await deps.fetchWithTimeout({
        url,
        headers: options.headers,
        requestTimeoutMs: options.timeoutMs,
        responseTimeoutMs: options.timeoutMs,
        resolvedAddresses,
      })
      // SecureHttpTransport.get must return a bare Response — @vouchington/domain-verification
      // reads the body itself with no signal parameter of its own — so the body-phase timeout
      // is applied by wrapping the body stream to abort once responseSignal fires.
      return withAbortableBody(response, responseSignal)
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

/**
 * Wraps a Response so its body stream aborts once `signal` fires. Used to hand a body-phase
 * timeout to code that reads the body itself and offers no way to pass a signal in.
 */
function withAbortableBody(response: Response, signal: AbortSignal): Response {
  if (!response.body) return response
  const reader = response.body.getReader()
  let released = false

  function release(): void {
    if (released) return
    released = true
    signal.removeEventListener('abort', onAbort)
  }

  function onAbort(): void {
    void reader.cancel(signal.reason).catch(onError).finally(release)
  }

  if (signal.aborted) onAbort()
  else signal.addEventListener('abort', onAbort, { once: true })

  return new Response(
    new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const result = await reader.read()
          if (result.done) {
            release()
            controller.close()
          } else {
            controller.enqueue(result.value)
          }
        } catch (error) {
          release()
          controller.error(error)
        }
      },
      async cancel(reason) {
        release()
        await reader.cancel(reason).catch(onError)
      },
    }),
    { status: response.status, statusText: response.statusText, headers: response.headers },
  )
}
