import Sentry from './sentry.mts'

const sentryThrottleMs = 10_000
const lastSentryReportByClientCommand = new Map<string, number>()

// Log to console when Sentry is disabled (development, CI) but not in test mode.
// Mirrors the identical pattern in index.mts — kept local to avoid changing the
// export surface of on-error/index.mts.
function shouldLogToConsole(): boolean {
  const env = process.env.NODE_ENV || 'development'
  if (env === 'test') return false
  return env === 'development' || !!process.env.CI
}

export type ValkeySaturationContext = {
  client: string
  command: string
  attempt: number
}

/**
 * Record a single Valkey inflight-saturation retry attempt.
 * Emits a console warning in development/CI, adds a Sentry breadcrumb so the
 * retry trail is visible when a subsequent onError() call fires, and captures
 * an alertable warning event for saturation monitoring.
 */
export function recordValkeySaturation(context: ValkeySaturationContext): void {
  if (shouldLogToConsole()) {
    console.warn('[valkey] inflight saturation retry', context)
  }
  Sentry.addBreadcrumb({
    category: 'valkey',
    message: 'inflight saturation retry',
    level: 'warning',
    data: context,
  })
  if (shouldCaptureSentryMessage(context)) {
    Sentry.captureMessage('valkey_inflight_saturation', {
      level: 'warning',
      tags: {
        reason: 'valkey_inflight_saturation',
        client: context.client,
        command: context.command,
      },
      extra: { attempt: context.attempt },
    })
  }
}

function shouldCaptureSentryMessage(context: ValkeySaturationContext): boolean {
  if (process.env.NODE_ENV === 'test') return true

  const throttleKey = `${context.client}:${context.command}`
  const now = Date.now()
  const lastReportedAt = lastSentryReportByClientCommand.get(throttleKey)

  if (lastReportedAt !== undefined && now - lastReportedAt < sentryThrottleMs) return false

  lastSentryReportByClientCommand.set(throttleKey, now)
  return true
}
