import Sentry from './sentry.mts'

// Log to console when Sentry is disabled (development, CI) but not in test mode.
// Mirrors the identical pattern in index.mts and worker-queue-topology-skew.mts — kept local to
// avoid changing the export surface of on-error/index.mts.
function shouldLogToConsole(): boolean {
  const env = process.env.NODE_ENV || 'development'
  if (env === 'test') return false
  return env === 'development' || !!process.env.CI
}

/**
 * Record that the API process attempted direct egress to a host that is neither on the IPv6
 * allowlist (`@modules/utils/ipv6-allowlist`) nor exempt as internal/private — see
 * `backend/modules/utils/http-egress-guardrail.mts`, the undici interceptor that calls this.
 *
 * This is a warn-mode-only observability signal ahead of the IPv4-removal epic (#7987): it never
 * blocks the request, it only reports so off-allowlist direct egress becomes visible before any
 * future fail-closed enforcement.
 *
 * Unlike `recordWorkerQueueTopologySkew`, which fires at most a few times per process startup and
 * relies solely on Sentry's message-based grouping to avoid noise, this function is called from a
 * live request hot path (every outbound HTTP call the API dispatcher makes). It intentionally does
 * NOT throttle itself — the caller (`reportOffAllowlistEgress` in
 * `@modules/utils/http-egress-guardrail.mts`) dedupes by host per process before calling this, so
 * this function fires at most once per distinct off-allowlist host per process.
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
