import Sentry from './sentry.mts'

// Log to console when Sentry is disabled (development, CI) but not in test mode.
// Mirrors the identical pattern in index.mts and the other named recorders in this module — kept
// local to avoid changing the export surface of on-error/index.mts.
function shouldLogToConsole(): boolean {
  const env = process.env.NODE_ENV || 'development'
  if (env === 'test') return false
  return env === 'development' || !!process.env.CI
}

const periodicThrottleMs = 60 * 60 * 1000
const lastPeriodicReportedAt = new Map<string, number>()

export type ClassifierRunAlarmContext =
  // The provider client could not be built, so the run's remote half was made terminal and its
  // local outcome kept. Only the error's name: its message can carry a key or a provider payload.
  | { kind: 'client-unavailable'; classifier: string; runId: string; errorName: string }
  // The provider permanently rejected the request for a reason an operator must fix (a rejected or
  // revoked key, exhausted credits, a malformed request, a guardrail block), so the run was made
  // terminal. Safe fields only: never the provider's message or any content. A moderation block
  // is about the content, not the deployment, and does not alarm.
  | {
      kind: 'provider-rejected'
      classifier: string
      runId: string
      status: number | undefined
      providerCode: number | string | undefined
      errorType: string | undefined
    }
  // The recovery sweep enqueued the run its bounded number of times without completing it, so the
  // run was made terminal. This is the loop alarm.
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
      incompleteRuns: number
    }
  // The oldest request that never became a run is older than any legitimate delay, for example a
  // permanently missing configuration or embedding, or a dispatcher enqueue that was lost.
  | {
      kind: 'request-age'
      classifier: string
      requestId: string
      oldestRequestAgeMs: number
      thresholdMs: number
      pendingRequests: number
    }
  // Live subjects the classifier should have been asked about have no request and no run, so the
  // producer skipped its write and nothing else will find them.
  | {
      kind: 'subject-unrequested'
      classifier: string
      unrequestedSubjects: number
      oldestUnrequestedAgeMs: number
      graceMs: number
    }
  // Many runs ended terminally inside the window; the counts show which kinds.
  | {
      kind: 'terminal-failures'
      classifier: string
      windowMs: number
      thresholdCount: number
      failedTotal: number
      failedByKind: Readonly<Record<string, number>>
      completed: number
    }

type AlarmKind = ClassifierRunAlarmContext['kind']

/**
 * The only fields an alarm may carry. Each is an identifier, a count, an age, a status or a failure
 * kind. A field outside this list is dropped, so a future caller cannot put prompt text, content,
 * a key, a token or a provider message into Sentry by adding one to a context.
 */
const ALARM_FIELDS = {
  'client-unavailable': ['classifier', 'runId', 'errorName'],
  'provider-rejected': ['classifier', 'runId', 'status', 'providerCode', 'errorType'],
  'sweep-bound-exceeded': ['classifier', 'runId', 'sweepEnqueueCount'],
  'run-age': ['classifier', 'runId', 'oldestRunAgeMs', 'thresholdMs', 'incompleteRuns'],
  'request-age': [
    'classifier',
    'requestId',
    'oldestRequestAgeMs',
    'thresholdMs',
    'pendingRequests',
  ],
  'subject-unrequested': ['classifier', 'unrequestedSubjects', 'oldestUnrequestedAgeMs', 'graceMs'],
  'terminal-failures': [
    'classifier',
    'windowMs',
    'thresholdCount',
    'failedTotal',
    'failedByKind',
    'completed',
  ],
} as const satisfies Record<AlarmKind, readonly string[]>

/**
 * The alarms that repeat on every 5-minute sweep while their condition holds. The at-once alarms
 * (missing key, rejected key, sweep bound) fire when a run ends, so each is reported every time.
 */
const PERIODIC_KINDS: ReadonlySet<AlarmKind> = new Set([
  'run-age',
  'request-age',
  'subject-unrequested',
  'terminal-failures',
])

/**
 * Record that a fixed-classifier run, request or subject needs an operator: its provider client is
 * unavailable, the provider permanently rejected it, the recovery sweep gave up on it, or the
 * classifier's receipt health crossed a threshold.
 *
 * One fixed message and a per-kind, per-classifier fingerprint group every run of a kind into one
 * Sentry issue (a missing API key alarms once per subject); ids stay in `extra`. Periodic alarms
 * are throttled to once per hour per kind and classifier, so one classifier's alarm never silences
 * another's. Thresholds are in `@services/classifier-runs`.
 */
export function recordClassifierRunAlarm(context: ClassifierRunAlarmContext): void {
  if (shouldLogToConsole()) {
    console.warn('[classifier-runs] run alarm', context)
  }
  const { kind, classifier } = context
  if (PERIODIC_KINDS.has(kind) && !shouldCapturePeriodic(`${kind}:${classifier}`)) return
  const fields: readonly string[] = ALARM_FIELDS[kind]
  const extra = Object.fromEntries(
    Object.entries(context).filter(([field]) => fields.includes(field)),
  )
  Sentry.captureMessage('classifier_run_alarm', {
    level: 'error',
    fingerprint: ['classifier_run_alarm', kind, classifier],
    tags: { reason: 'classifier_run_alarm', alarm_kind: kind, classifier },
    extra,
  })
}

function shouldCapturePeriodic(key: string): boolean {
  if (process.env.NODE_ENV === 'test') return true

  const now = Date.now()
  const last = lastPeriodicReportedAt.get(key)
  if (last !== undefined && now - last < periodicThrottleMs) return false
  lastPeriodicReportedAt.set(key, now)
  return true
}
