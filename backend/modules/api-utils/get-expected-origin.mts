import { createHash, timingSafeEqual } from 'node:crypto'
import { isDeployedEnvironment } from '@ts-shared/deploy-environment'

const CF_WORKER_SECRET_HEADER = 'x-cf-worker-secret'

let cachedExpectedSecret: string | undefined
let cachedExpectedSecretHash: Uint8Array | undefined

export function getExpectedOrigin(req: {
  headers: Record<string, string | string[] | undefined>
}): string {
  const trustForwardedHeaders = isTrustedForwardedRequest(req.headers)
  const proto =
    (trustForwardedHeaders
      ? firstHeaderValue(req.headers['x-forwarded-proto'])
      : undefined
    )?.toLowerCase() ?? (isDeployedEnvironment() ? 'https' : 'http')
  const rawHost = getExpectedHost(req.headers)
  const host = normalizeDefaultPort(rawHost, proto)
  return `${proto}://${host}`
}

// Returns the public-facing Host the Cloudflare Worker forwarded (x-forwarded-host), only when
// the shared worker secret validates — otherwise the raw (possibly origin-internal) Host header.
// Callers that need the client-signed host verbatim (e.g. HTTP Signature verification, which
// compares against exactly what the remote server signed) should use this instead of
// getExpectedOrigin(), which additionally composes a scheme and normalizes default ports.
// Returns '' (not undefined) when neither x-forwarded-host nor Host is present (round-5 re-review):
// the sole current caller (inbox.mts) guards with `|| undefined`. A future caller that reflects
// this value into a header or builds a URL from it without the same guard would open a
// host-header-injection vector — validate before doing either.
export function getExpectedHost(headers: Record<string, string | string[] | undefined>): string {
  const trustForwardedHeaders = isTrustedForwardedRequest(headers)
  return (
    (trustForwardedHeaders ? firstHeaderValue(headers['x-forwarded-host']) : undefined) ??
    firstHeaderValue(headers.host) ??
    ''
  )
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  const header = Array.isArray(value) ? value[0] : value
  return header
    ?.split(',')
    .map(token => token.trim())
    .find(token => token.length > 0)
}

function isTrustedForwardedRequest(headers: Record<string, string | string[] | undefined>) {
  const expectedSecret = process.env.CF_WORKER_SECRET
  if (!expectedSecret) return false

  const headerValue = firstHeaderValue(headers[CF_WORKER_SECRET_HEADER])
  if (!headerValue) return false

  const expectedHash = getExpectedSecretHash(expectedSecret)
  const headerHash = createHash('sha256').update(headerValue).digest()

  return timingSafeEqual(expectedHash, headerHash)
}

function getExpectedSecretHash(expectedSecret: string): Uint8Array {
  if (expectedSecret !== cachedExpectedSecret || !cachedExpectedSecretHash) {
    cachedExpectedSecret = expectedSecret
    cachedExpectedSecretHash = createHash('sha256').update(expectedSecret).digest()
  }
  return cachedExpectedSecretHash
}

function normalizeDefaultPort(host: string, proto: string): string {
  if (proto === 'https') return host.replace(/:443$/, '')
  if (proto === 'http') return host.replace(/:80$/, '')
  return host
}
