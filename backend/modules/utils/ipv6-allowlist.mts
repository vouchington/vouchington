import { isIP } from 'node:net'

/**
 * The IPv6-capable egress allowlist from the API's AAAA record audit (epic #7987).
 *
 * Epic #7987 removes the public IPv4 address from the API Fargate task (~$18.25/mo savings) once
 * every external integration the API calls directly can be reached over IPv6. The audit split the
 * API's external calls into two sets: hosts that already resolve AAAA records and can be called
 * directly once the public IPv4 address is gone (this allowlist), and IPv4-only hosts that must
 * use an explicit egress proxy before the IPv4 address can be removed.
 *
 * A host's absence from this list is intentional: it is IPv4-only, dynamically discovered, or not
 * called directly by the API. `backend/modules/utils/http-egress-guardrail.mts` wraps the API's
 * shared undici dispatcher and reports (warn-mode only, never blocks) direct egress to a host that
 * is neither on this allowlist nor exempt as internal/private. Keep this list synchronized with the
 * production-server egress catalog in `docs/overview/infrastructure/networking.md`.
 */
export const IPV6_ALLOWLIST: readonly string[] = [
  'o4507688154824704.ingest.us.sentry.io',
  'challenges.cloudflare.com',
  'recaptchaenterprise.googleapis.com',
  'webrisk.googleapis.com',
  'www.googleapis.com',
  'graph.facebook.com',
  'www.linkedin.com',
  'api.linkedin.com',
  'login.microsoftonline.com',
  'graph.microsoft.com',
  'firehose.us-west-2.api.aws',
  'email.us-west-2.api.aws',
  'monitoring.us-west-2.api.aws',
]

// S3 uses virtual-hosted bucket subdomains, so its audited dual-stack service endpoint must match
// by suffix. Other AWS clients remain exact-host entries above.
const IPV6_ALLOWLIST_SUFFIXES = ['s3.dualstack.us-west-2.amazonaws.com']

const EXEMPT_SUFFIXES = ['.internal', '.local', '.test']
const EXEMPT_HOSTS = new Set(['localhost'])

/**
 * True when `host` is an exact audited provider host or the audited S3 dual-stack service suffix.
 */
export function isIpv6AllowlistedHost(host: string): boolean {
  if (IPV6_ALLOWLIST.includes(host)) return true
  return IPV6_ALLOWLIST_SUFFIXES.some(suffix => host === suffix || host.endsWith(`.${suffix}`))
}

/**
 * True when `host` is internal/private/loopback infrastructure that the egress guardrail should
 * never report on, regardless of IPv6 capability — these are not external egress at all.
 */
export function isExemptEgressHost(host: string): boolean {
  if (EXEMPT_HOSTS.has(host)) return true
  if (EXEMPT_SUFFIXES.some(suffix => host.endsWith(suffix))) return true
  return isPrivateOrLoopbackHost(host)
}

function isPrivateOrLoopbackHost(host: string): boolean {
  // Strip brackets from bracketed IPv6 literals (e.g. "[::1]" from a URL authority).
  const bare = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host
  // The private-range checks below match on string prefixes (e.g. "fc"/"fd"/"10."), which would
  // also match public hostnames that happen to start the same way (fcm.googleapis.com,
  // 10.example.com) if applied to `bare` directly. Gate them on `bare` actually being an IP
  // literal first — a hostname is never classified as private/loopback by this function.
  const family = isIP(bare)
  if (family === 4) {
    if (bare === '127.0.0.1' || bare === '0.0.0.0') return true
    if (/^127\./.test(bare)) return true
    if (/^10\./.test(bare)) return true
    if (/^192\.168\./.test(bare)) return true
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(bare)) return true
    if (/^169\.254\./.test(bare)) return true
    return false
  }
  if (family === 6) {
    if (bare === '::1') return true
    if (bare.startsWith('fc') || bare.startsWith('fd')) return true // unique local IPv6
    if (bare.startsWith('fe80:')) return true // link-local IPv6
    return false
  }
  return false
}
