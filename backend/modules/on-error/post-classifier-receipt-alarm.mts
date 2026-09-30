import Sentry from './sentry.mts'

// Log to console when Sentry is disabled (development, CI) but not in test mode.
// Mirrors the identical pattern in index.mts and the other named recorders in this module — kept
// local to avoid changing the export surface of on-error/index.mts.
function shouldLogToConsole(): boolean {
  const env = process.env.NODE_ENV || 'development'
  if (env === 'test') return false
  return env === 'development' || !!process.env.CI
}

const receiptAgeThrottleMs = 60 * 60 * 1000
let lastReceiptAgeReportedAt: number | undefined

export type PostClassifierReceiptAlarmContext =
  // The provider client could not be built, so the receipt's remote half was made terminal and its
  // local detector outcome kept.
  | { kind: 'client-unavailable'; postId: string; applicationId: string; error: string }
  // The recovery sweep enqueued the receipt its bounded number of times without completing it.
  // `terminal` is false for local-only and effect-only receipts, which the schema cannot mark
  // terminal, so they are only abandoned.
  | {
      kind: 'sweep-bound-exceeded'
      postId: string
      applicationId: string
      sweepEnqueueCount: number
      terminal: boolean
    }
  // The oldest still-recoverable receipt is older than any legitimate delay, so classification
  // is stuck somewhere the other alarms do not cover.
  | {
      kind: 'receipt-age'
      postId: string
      applicationId: string
      oldestReceiptAgeMs: number
      thresholdMs: number
    }

/**
 * Record that a C5 post-classifier receipt needs an operator: its provider client is unavailable,
 * the recovery sweep gave up on it, or the oldest incomplete receipt is stale.
 *
 * One fixed message and a per-kind fingerprint group every receipt of a kind into one Sentry issue
 * (a missing API key alarms once per post); receipt ids stay in `extra`. The age alarm repeats on
 * every 5-minute sweep while a stale receipt exists, so Sentry reporting of it is throttled to once
 * per hour. C12 (#225) owns receipt-health alarming and thresholds going forward.
 */
export function recordPostClassifierReceiptAlarm(context: PostClassifierReceiptAlarmContext): void {
  if (shouldLogToConsole()) {
    console.warn('[post-classifier] receipt alarm', context)
  }
  if (context.kind === 'receipt-age' && !shouldCaptureReceiptAge()) return
  const { kind, ...extra } = context
  Sentry.captureMessage('post_classifier_receipt_alarm', {
    level: 'error',
    fingerprint: ['post_classifier_receipt_alarm', kind],
    tags: { reason: 'post_classifier_receipt_alarm', alarm_kind: kind },
    extra,
  })
}

function shouldCaptureReceiptAge(): boolean {
  if (process.env.NODE_ENV === 'test') return true

  const now = Date.now()
  if (
    lastReceiptAgeReportedAt !== undefined &&
    now - lastReceiptAgeReportedAt < receiptAgeThrottleMs
  ) {
    return false
  }
  lastReceiptAgeReportedAt = now
  return true
}
