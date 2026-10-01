import Sentry from './sentry.mts'

// Log to console when Sentry is disabled (development, CI) but not in test mode.
// Mirrors the identical pattern in index.mts and the other named recorders in this module — kept
// local to avoid changing the export surface of on-error/index.mts.
function shouldLogToConsole(): boolean {
  const env = process.env.NODE_ENV || 'development'
  if (env === 'test') return false
  return env === 'development' || !!process.env.CI
}

const ageThrottleMs = 60 * 60 * 1000
const lastAgeReportedAt = new Map<string, number>()

export type ClassifierRunAlarmContext =
  // The provider client could not be built, so the run's remote half was made terminal and its
  // local outcome kept.
  | { kind: 'client-unavailable'; classifier: string; runId: string; error: string }
  // The recovery sweep enqueued the run its bounded number of times without completing it, so the
  // run was made terminal.
  | {
      kind: 'sweep-bound-exceeded'
      classifier: string
      runId: string
      sweepEnqueueCount: number
    }
  // The oldest still-recoverable run is older than any legitimate delay, so classification is
  // stuck somewhere the other alarms do not cover.
  | {
      kind: 'run-age'
      classifier: string
      runId: string
      oldestRunAgeMs: number
      thresholdMs: number
    }
  // The oldest eligible subject that never reserved a run is older than any legitimate delay, for
  // example a permanently missing configuration or embedding.
  | {
      kind: 'request-age'
      classifier: string
      requestId: string
      oldestRequestAgeMs: number
      thresholdMs: number
    }

/**
 * Record that a fixed-classifier run or request needs an operator: its provider client is
 * unavailable, the recovery sweep gave up on it, or the oldest incomplete run or unreserved request
 * is stale.
 *
 * One fixed message and a per-kind, per-classifier fingerprint group every run of a kind into one
 * Sentry issue (a missing API key alarms once per subject); run ids stay in `extra`. The age
 * alarms repeat on every 5-minute sweep while a stale item exists, so Sentry reporting of each is
 * throttled to once per hour. C12 (#225) owns run-health alarming and thresholds going forward.
 */
export function recordClassifierRunAlarm(context: ClassifierRunAlarmContext): void {
  if (shouldLogToConsole()) {
    console.warn('[classifier-runs] run alarm', context)
  }
  const { kind, ...extra } = context
  if ((kind === 'run-age' || kind === 'request-age') && !shouldCaptureAge(kind)) return
  Sentry.captureMessage('classifier_run_alarm', {
    level: 'error',
    fingerprint: ['classifier_run_alarm', kind, context.classifier],
    tags: { reason: 'classifier_run_alarm', alarm_kind: kind, classifier: context.classifier },
    extra,
  })
}

function shouldCaptureAge(kind: string): boolean {
  if (process.env.NODE_ENV === 'test') return true

  const now = Date.now()
  const last = lastAgeReportedAt.get(kind)
  if (last !== undefined && now - last < ageThrottleMs) return false
  lastAgeReportedAt.set(kind, now)
  return true
}
