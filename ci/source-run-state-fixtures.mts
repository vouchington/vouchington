import {
  MAX_SOURCE_RUN_AGE_MS,
  type ExpectedSourceRun,
  type SourceRunState,
  type WorkflowRunResponse,
} from './source-run-assessment.mts'

export interface SourceRunStateFixture {
  name: string
  response: WorkflowRunResponse
  expected: ExpectedSourceRun
  now: number
  result: SourceRunState
}

const FIXTURE_EXPECTED: ExpectedSourceRun = {
  conclusion: 'failure',
  repository: 'jonathanong/filaments',
  runAttempt: 1,
  runId: 30_503_060_858,
}

const FIXTURE_RUN_STARTED_AT = '2026-08-01T00:00:00.000Z'
const FIXTURE_RUN_STARTED_AT_MS = Date.parse(FIXTURE_RUN_STARTED_AT)
const FIXTURE_NOW = FIXTURE_RUN_STARTED_AT_MS + 60_000

const FIXTURE_RUN: WorkflowRunResponse = {
  conclusion: 'failure',
  id: 30_503_060_858,
  repository: { full_name: 'jonathanong/filaments' },
  run_attempt: 1,
  run_started_at: FIXTURE_RUN_STARTED_AT,
  status: 'completed',
}

/**
 * Well-formed-response fixtures shared between source-run-assessment.test.mts (which asserts
 * assessSourceRunState directly) and source-run-guard-shell.test.mts (which feeds the same
 * responses through the spliced shell guard and checks its bucket matches). Excludes
 * invalid-input and malformed-response: the shell guard has no manual-dispatch path to feed it
 * invalid input, and a run_started_at/repository-class malformation makes the shell's own
 * `gh api --jq` pipeline fail, landing in the same fetch-failure fail-closed branch as api-error.
 * Scalar type violations (e.g. a null/zero run_attempt, or a non-string status/conclusion) do not
 * converge the same way: they still produce a well-formed TSV row, so the shell suppresses as
 * stale (exit 0) where assessSourceRunState fails closed as malformed-response (exit 1) — both
 * sides write `current=false`, so no unsafe mutation is possible, but the job verdict and
 * annotation differ.
 */
export const SOURCE_RUN_STATE_FIXTURES: readonly SourceRunStateFixture[] = [
  {
    name: 'the same completed failing attempt',
    response: FIXTURE_RUN,
    expected: FIXTURE_EXPECTED,
    now: FIXTURE_NOW,
    result: { current: true, reason: 'current-failed-attempt' },
  },
  {
    name: 'a response for a different repository',
    response: { ...FIXTURE_RUN, repository: { full_name: 'jonathanong/another-repo' } },
    expected: FIXTURE_EXPECTED,
    now: FIXTURE_NOW,
    result: { current: false, reason: 'repository-mismatch' },
  },
  {
    name: 'a response for the same repository in a different case',
    response: { ...FIXTURE_RUN, repository: { full_name: 'JonathanOng/Filaments' } },
    expected: FIXTURE_EXPECTED,
    now: FIXTURE_NOW,
    result: { current: true, reason: 'current-failed-attempt' },
  },
  {
    name: 'a response for a different run id',
    response: { ...FIXTURE_RUN, id: 1 },
    expected: FIXTURE_EXPECTED,
    now: FIXTURE_NOW,
    result: { current: false, reason: 'run-id-mismatch' },
  },
  {
    name: 'a later run attempt',
    response: { ...FIXTURE_RUN, run_attempt: 2 },
    expected: FIXTURE_EXPECTED,
    now: FIXTURE_NOW,
    result: { current: false, reason: 'run-attempt-changed' },
  },
  {
    name: 'a run no longer completed',
    response: { ...FIXTURE_RUN, status: 'in_progress', conclusion: null },
    expected: FIXTURE_EXPECTED,
    now: FIXTURE_NOW,
    result: { current: false, reason: 'status-changed' },
  },
  {
    name: 'a changed conclusion',
    response: { ...FIXTURE_RUN, conclusion: 'cancelled' },
    expected: FIXTURE_EXPECTED,
    now: FIXTURE_NOW,
    result: { current: false, reason: 'conclusion-changed' },
  },
  {
    name: 'a run just under the age bound',
    response: FIXTURE_RUN,
    expected: FIXTURE_EXPECTED,
    now: FIXTURE_RUN_STARTED_AT_MS + MAX_SOURCE_RUN_AGE_MS - 1,
    result: { current: true, reason: 'current-failed-attempt' },
  },
  {
    name: 'a run just over the age bound',
    response: FIXTURE_RUN,
    expected: FIXTURE_EXPECTED,
    now: FIXTURE_RUN_STARTED_AT_MS + MAX_SOURCE_RUN_AGE_MS + 1,
    result: { current: false, reason: 'stale-source-run' },
  },
]
