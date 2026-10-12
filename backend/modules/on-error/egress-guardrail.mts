import Sentry from './sentry.mts'
import { shouldLogToConsole } from './should-log-to-console.mts'

/**
 * Record that the API process attempted direct egress to a host that is neither on the IPv6
 * allowlist (`@modules/utils/ipv6-allowlist`) nor exempt as internal/private — see
 * `backend/modules/utils/http-egress-guardrail.mts`, the undici interceptor that calls this.
 *
 * This is a warn-mode-only observability signal ahead of the IPv4-removal epic (#7987): it never
 * blocks the request, it only reports so off-allowlist direct egress becomes visible before any
 * future fail-closed enforcement.
 *
 * This function is called from a live request hot path (every outbound HTTP call the API
 * dispatcher makes). It intentionally does NOT throttle itself — the caller
 * (`reportOffAllowlistEgress` in `@modules/utils/http-egress-guardrail.mts`) dedupes by host per
 * process before calling this, so this function fires at most once per distinct off-allowlist host
 * per process.
 */
export function recordOffAllowlistEgress(
  host: string,
  extra: { path?: string; method?: string },
): void {
  if (shouldLogToConsole()) {
    console.warn('[egress-guardrail] off-allowlist API egress', host, extra)
  }
  Sentry.captureMessage(`off-allowlist API egress: ${host}`, {
    level: 'warning',
    tags: { egress_guardrail: 'off_allowlist', egress_host: host },
    extra,
  })
}
