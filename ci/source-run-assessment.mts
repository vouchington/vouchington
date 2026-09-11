export interface ExpectedSourceRun {
  conclusion: string
  repository: string
  runAttempt: number
  runId: number
}

export interface SourceRunState {
  current: boolean
  reason:
    | 'api-error'
    | 'conclusion-changed'
    | 'current-failed-attempt'
    | 'invalid-input'
    | 'malformed-response'
    | 'repository-mismatch'
    | 'run-attempt-changed'
    | 'run-id-mismatch'
    | 'stale-source-run'
    | 'status-changed'
}

export const FAILED_CONCLUSIONS = new Set(['failure', 'timed_out', 'cancelled'])

/**
 * A source run older than this is presumed superseded by later main activity; escalating on it
 * risks reviving an already-fixed failure with a stale, contentless issue. Kept comfortably
 * inside the 3-day artifact/log retention window so anything that clears this bound still has
 * fetchable logs. fix-main.yml's no-checkout guards splice in this bound via
 * ci/source-run-guard-shell.mts, which interpolates it from here, so the two cannot drift out of
 * sync.
 */
export const MAX_SOURCE_RUN_AGE_MS = 48 * 60 * 60 * 1000

export interface WorkflowRunResponse {
  conclusion: string | null
  id: number
  repository: { full_name: string }
  run_attempt: number
  run_started_at: string
  status: string
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

// Accepts any string Date.parse can resolve, not strictly ISO 8601 — the sole caller validates
// GitHub API's `run_started_at`, which always emits ISO 8601, so the broader acceptance is unused
// in practice but intentional (avoids reimplementing ISO 8601 validation for no behavioral gain).
function isParseableTimestamp(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && !Number.isNaN(Date.parse(value))
}

function isWorkflowRunResponse(value: unknown): value is WorkflowRunResponse {
  if (typeof value !== 'object' || value === null) return false
  const run = value as Partial<WorkflowRunResponse>
  return (
    isPositiveSafeInteger(run.id) &&
    isPositiveSafeInteger(run.run_attempt) &&
    typeof run.status === 'string' &&
    (typeof run.conclusion === 'string' || run.conclusion === null) &&
    isParseableTimestamp(run.run_started_at) &&
    typeof run.repository === 'object' &&
    run.repository !== null &&
    typeof run.repository.full_name === 'string' &&
    run.repository.full_name.trim().length > 0
  )
}

export function assessSourceRunState(
  response: unknown,
  expected: ExpectedSourceRun,
  now: number,
): SourceRunState {
  if (
    !isPositiveSafeInteger(expected.runId) ||
    !isPositiveSafeInteger(expected.runAttempt) ||
    expected.repository.trim().length === 0 ||
    !FAILED_CONCLUSIONS.has(expected.conclusion)
  ) {
    return { current: false, reason: 'invalid-input' }
  }
  if (!isWorkflowRunResponse(response)) {
    return { current: false, reason: 'malformed-response' }
  }
  if (response.repository.full_name.toLowerCase() !== expected.repository.toLowerCase()) {
    return { current: false, reason: 'repository-mismatch' }
  }
  if (response.id !== expected.runId) {
    return { current: false, reason: 'run-id-mismatch' }
  }
  if (response.run_attempt !== expected.runAttempt) {
    return { current: false, reason: 'run-attempt-changed' }
  }
  if (response.status !== 'completed') {
    return { current: false, reason: 'status-changed' }
  }
  if (response.conclusion !== expected.conclusion) {
    return { current: false, reason: 'conclusion-changed' }
  }
  if (now - Date.parse(response.run_started_at) > MAX_SOURCE_RUN_AGE_MS) {
    return { current: false, reason: 'stale-source-run' }
  }
  return { current: true, reason: 'current-failed-attempt' }
}
