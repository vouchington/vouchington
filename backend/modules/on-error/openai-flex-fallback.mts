import Sentry from './sentry.mts'

// Log to console when Sentry is disabled (development, CI) but not in test mode.
// Mirrors the identical pattern in index.mts and the other named recorders in this module — kept
// local to avoid changing the export surface of on-error/index.mts.
function shouldLogToConsole(): boolean {
  const env = process.env.NODE_ENV || 'development'
  if (env === 'test') return false
  return env === 'development' || !!process.env.CI
}

const sentryThrottleMs = 60_000
const lastSentryReportByKey = new Map<string, number>()

export type OpenAiFlexFallbackContext = {
  provider: 'openai' | 'openrouter'
  model: string
  // 'http_429': the flex `resource_unavailable` 429 outlasted the free retry budget.
  // 'stream_failed': a streamed `response.failed` reported flex processing as unavailable.
  trigger: 'http_429' | 'stream_failed'
}

/**
 * Record that a `service_tier: 'flex'` request hit flex capacity unavailability and was resent
 * once on the default tier (`backend/modules/openai-utils/flex-fallback.mts`). The resend is
 * billed at the standard price (about twice flex), which the ledger records from the served
 * `response.service_tier`; this event is what makes the extra spend visible before the ledger is
 * queried.
 *
 * A flex capacity incident can hit every concurrent request at once, so Sentry reporting is
 * throttled to once per minute per provider/trigger — the breadcrumb and console output stay
 * unthrottled because they are low-volume and local.
 */
export function recordOpenAiFlexFallback(context: OpenAiFlexFallbackContext): void {
  if (shouldLogToConsole()) {
    console.warn('[openai-utils] flex capacity unavailable, resending on the default tier', context)
  }
  Sentry.addBreadcrumb({
    category: 'openai',
    message: 'flex capacity unavailable, resending on the default tier',
    level: 'warning',
    data: context,
  })
  if (!shouldCaptureSentryMessage(context)) return
  Sentry.captureMessage('openai_flex_fallback', {
    level: 'warning',
    tags: {
      reason: 'openai_flex_fallback',
      provider: context.provider,
      trigger: context.trigger,
    },
    extra: { model: context.model },
  })
}

function shouldCaptureSentryMessage(context: OpenAiFlexFallbackContext): boolean {
  if (process.env.NODE_ENV === 'test') return true

  const throttleKey = `${context.provider}:${context.trigger}`
  const now = Date.now()
  const lastReportedAt = lastSentryReportByKey.get(throttleKey)
  if (lastReportedAt !== undefined && now - lastReportedAt < sentryThrottleMs) return false

  lastSentryReportByKey.set(throttleKey, now)
  return true
}
