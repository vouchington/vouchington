import Sentry from './sentry.mts'

// Log to console when Sentry is disabled (development, CI) but not in test mode.
// Mirrors the identical pattern in index.mts and the other named recorders in this module — kept
// local to avoid changing the export surface of on-error/index.mts.
function shouldLogToConsole(): boolean {
  const env = process.env.NODE_ENV || 'development'
  if (env === 'test') return false
  return env === 'development' || !!process.env.CI
}

export type CopyrightRetentionErasureFailureContext = {
  /** Cases the same run erased before or after the failures. */
  erased: number
  /** Cases left exactly as they were for the next run; `reason` is an error class name. */
  failed: readonly { noticeId: string; reason: string }[]
}

/**
 * Sends one tagged Sentry warning when the copyright evidence retention sweep leaves cases behind,
 * for example because the evidence bucket refused a delete. Nothing is sent when no case failed.
 * The event carries counts, notice ids and error class names only, copied field by field so no
 * claimant, poster, sender, storage key or bucket detail can ride along. The sweep is hourly and
 * bounded, so there is no in-process throttle. Returns whether a warning was sent.
 */
export function recordCopyrightRetentionErasureFailure(
  context: CopyrightRetentionErasureFailureContext,
): boolean {
  if (context.failed.length === 0) return false
  const extra = {
    erasedCount: context.erased,
    failedCount: context.failed.length,
    failures: context.failed.map(({ noticeId, reason }) => ({ noticeId, reason })),
  }
  if (shouldLogToConsole()) {
    console.warn('[copyright] retention erasure left cases for the next run', extra)
  }
  Sentry.captureMessage('copyright_retention_erasure_failed', {
    level: 'warning',
    tags: {
      reason: 'copyright_retention_erasure_failed',
      partial: String(context.erased > 0),
    },
    extra,
  })
  return true
}
