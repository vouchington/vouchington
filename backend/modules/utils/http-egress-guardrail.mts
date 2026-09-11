import type { Dispatcher } from 'undici'
import { recordOffAllowlistEgress } from '@modules/on-error'
import { isExemptEgressHost, isIpv6AllowlistedHost } from './ipv6-allowlist.mts'

export type EgressOriginClassification = 'exempt' | 'allowlisted' | 'off-allowlist'

/**
 * Classifies an outbound-request origin against the IPv6 allowlist (`./ipv6-allowlist.mts`):
 * `'exempt'` for internal/private/loopback hosts and unparseable origins, `'allowlisted'` for
 * hosts the AAAA audit confirmed are IPv6-capable, `'off-allowlist'` for everything else — the
 * set the egress guardrail reports on.
 */
export function classifyEgressOrigin(origin: string | URL | undefined): EgressOriginClassification {
  if (!origin) return 'exempt'
  const host = getHostname(origin)
  if (!host) return 'exempt'
  if (isExemptEgressHost(host)) return 'exempt'
  if (isIpv6AllowlistedHost(host)) return 'allowlisted'
  return 'off-allowlist'
}

const reportedHosts = new Set<string>()

/**
 * Reports an off-allowlist host to Sentry via `recordOffAllowlistEgress`, at most once per
 * distinct host per process. This dedupe lives here (not in `recordOffAllowlistEgress` itself)
 * because this is called from a live request hot path, not just process startup.
 */
export function reportOffAllowlistEgress(
  host: string,
  extra: { path?: string; method?: string },
): void {
  if (reportedHosts.has(host)) return
  reportedHosts.add(host)
  recordOffAllowlistEgress(host, extra)
}

/**
 * Builds a warn-mode-only undici compose interceptor for the API egress guardrail (epic #7987,
 * issue #7991). It classifies every outbound request's origin and reports off-allowlist direct
 * egress to Sentry, but always delegates to `dispatch` — it never throws and never short-circuits
 * the request. Fail-closed enforcement is a separate future PR.
 */
export function createEgressGuardrailInterceptor(): Dispatcher.DispatcherComposeInterceptor {
  return dispatch => (opts, handler) => {
    const classification = classifyEgressOrigin(opts.origin)
    if (classification === 'off-allowlist' && opts.origin) {
      const host = getHostname(opts.origin)
      if (host) {
        reportOffAllowlistEgress(host, { path: stripQueryString(opts.path), method: opts.method })
      }
    }
    return dispatch(opts, handler)
  }
}

/** Test-only: clears the per-process dedupe cache between test cases. */
export function resetEgressGuardrailDedupeForTest(): void {
  reportedHosts.clear()
}

function getHostname(origin: string | URL): string | undefined {
  try {
    return (typeof origin === 'string' ? new URL(origin) : origin).hostname
  } catch {
    return undefined
  }
}

/**
 * Strips the query string from a request path before it reaches Sentry/console.warn — the
 * guardrail only needs host-level evidence, and query strings can carry sensitive values (e.g. a
 * user's search term on `/api/v1/fediverse/search?q=...`).
 */
function stripQueryString(path: string | undefined): string | undefined {
  if (!path) return path
  const queryIndex = path.indexOf('?')
  return queryIndex === -1 ? path : path.slice(0, queryIndex)
}
