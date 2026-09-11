/**
 * Returns true if the error's cause chain was a DNS lookup failure.
 * Non-DNS network errors (ECONNREFUSED, SSL, etc.) return false.
 */
export function isCrawlerNetworkDnsError(error: Error): boolean {
  // Walk the cause chain: Node.js fetch throws TypeError('fetch failed') wrapping
  // the underlying DNS error, so we need to check nested causes.
  let cause: unknown = (error as Error & { cause?: unknown }).cause
  const visited = new Set<unknown>()
  while (cause instanceof Error && !visited.has(cause)) {
    visited.add(cause)
    const code = (cause as Error & { code?: unknown }).code
    if (code === 'DNS_NULL_ROUTE' || code === 'ENOTFOUND') {
      return true
    }
    // Keep message fallback for older/wrapped errors that do not expose a .code.
    const msg = cause.message?.toLowerCase() ?? ''
    if (msg.includes('enotfound') || msg.includes('getaddrinfo')) return true
    cause = (cause as Error & { cause?: unknown }).cause
  }
  return false
}

/**
 * Returns true if the error's cause chain was a TLS certificate hostname
 * mismatch. These are target-host configuration failures, unlike transient
 * connection resets or timeouts.
 */
export function isCrawlerNetworkTlsHostnameError(error: Error): boolean {
  let cause: unknown = (error as Error & { cause?: unknown }).cause
  const visited = new Set<unknown>()
  while (cause instanceof Error && !visited.has(cause)) {
    visited.add(cause)
    const code = (cause as Error & { code?: unknown }).code
    if (code === 'ERR_TLS_CERT_ALTNAME_INVALID') return true
    cause = (cause as Error & { cause?: unknown }).cause
  }
  return false
}
