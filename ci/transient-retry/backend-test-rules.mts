import type { TransientRetryRule, WorkflowRunContext } from './types.mts'

import { CI_AGGREGATE_FAN_IN_JOB_NAMES } from './ci-aggregate-jobs.mts'
export const backendUnitJobPrefix = 'test-backend-unit / backend-tests ('
const ansiEscapePattern = new RegExp(
  `${String.fromCodePoint(27)}\\[[0-?]*[ -/]*[@-~]|\\^\\[\\[[0-?]*[ -/]*[@-~]`,
  'g',
)
const githubLogTimestampPrefixPattern = String.raw`(?:(?:[^\n\t]*\t[^\n\t]*\t)?\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\s+)?`
const passedTestFilesSummaryPattern = new RegExp(
  String.raw`^\s*${githubLogTimestampPrefixPattern}Test Files\s+\d+\s+passed\b`,
  'm',
)
const failedTestFilesSummaryPattern = new RegExp(
  String.raw`^\s*${githubLogTimestampPrefixPattern}Test Files\s+\d+\s+failed\b`,
  'm',
)
const passedTestsSummaryPattern = new RegExp(
  String.raw`^\s*${githubLogTimestampPrefixPattern}Tests\s+\d+\s+passed\b`,
  'm',
)
const failedTestsSummaryPattern = new RegExp(
  String.raw`^\s*${githubLogTimestampPrefixPattern}Tests\s+\d+\s+failed\b`,
  'm',
)
const vitestUnhandledWorkerExitSummaryPattern =
  /Vitest caught (?<count>\d+) unhandled errors? during the test run\./
// #8940: line-anchored (like the four summary patterns above) rather than a bare substring search.
// test-helpers/vitest-worker-exit-diagnostics-reporter.mts's "unhandled errors:" section JSON-dumps
// the same SerializedError objects Vitest already printed, so an unanchored search over the whole
// log can double-count these two markers if a future error shape lets its serialized `stack`/
// `message` fields surface this exact text within a single JSON line. Anchoring to true line start
// excludes any JSON-embedded copy, which is always preceded by other text (a `  - {"..."` prefix) on
// its line, and keeps counting only Vitest's own printed trace lines.
const vitestWorkerForksEmittedErrorPattern = new RegExp(
  String.raw`^\s*${githubLogTimestampPrefixPattern}Error: \[vitest-pool\]: Worker forks emitted error\.`,
  'gm',
)
const vitestWorkerExitedUnexpectedlyCausePattern = new RegExp(
  String.raw`^\s*${githubLogTimestampPrefixPattern}Caused by: Error: Worker exited unexpectedly`,
  'gm',
)

export function isBackendUnitShard(name: string): boolean {
  return name.startsWith(backendUnitJobPrefix)
}

function getSoleGenuinelyFailedBackendUnitShard(ctx: WorkflowRunContext): string | null {
  const genuinelyFailed = ctx.failedJobNames.filter(
    name => ctx.jobConclusions?.get(name) !== 'cancelled',
  )
  if (genuinelyFailed.length !== 1) return null
  const [jobName] = genuinelyFailed
  return jobName && isBackendUnitShard(jobName) ? jobName : null
}

function getSoleGenuinelyFailedBackendUnitShardIgnoringAggregates(
  ctx: WorkflowRunContext,
): string | null {
  const genuinelyFailed = ctx.failedJobNames.filter(
    name =>
      ctx.jobConclusions?.get(name) !== 'cancelled' && !CI_AGGREGATE_FAN_IN_JOB_NAMES.has(name),
  )
  if (genuinelyFailed.length !== 1) return null
  const [jobName] = genuinelyFailed
  return jobName && isBackendUnitShard(jobName) ? jobName : null
}

function resolveBackendUnitShardJobName(ctx: WorkflowRunContext): string | null {
  return ctx.workflowName === 'CI'
    ? getSoleGenuinelyFailedBackendUnitShardIgnoringAggregates(ctx)
    : getSoleGenuinelyFailedBackendUnitShard(ctx)
}

function stripAnsi(log: string): string {
  return log.replace(ansiEscapePattern, '')
}

function hasOnlyVitestWorkerExitUnhandledErrors(log: string): boolean {
  const summaryMatch = vitestUnhandledWorkerExitSummaryPattern.exec(log)
  const unhandledErrorCount = Number.parseInt(summaryMatch?.groups?.count ?? '', 10)
  if (!Number.isSafeInteger(unhandledErrorCount) || unhandledErrorCount < 1) return false

  const workerForkErrorCount = log.match(vitestWorkerForksEmittedErrorPattern)?.length ?? 0
  const workerExitCauseCount = log.match(vitestWorkerExitedUnexpectedlyCausePattern)?.length ?? 0
  return (
    workerForkErrorCount === unhandledErrorCount && workerExitCauseCount === unhandledErrorCount
  )
}

// Exported so repo-owned-literal-freshness.test.mts asserts against the exact same literals this
// predicate matches on, rather than a second, independently-drifting copy (see #10806/#10825).
export const backendLogoutTestPath = 'backend/api/v1/auth/logout.test.mts'
export const backendLogoutRouteDescribeTitle = 'POST /api/v1/auth/logout'
export const backendLogoutRateLimitTestTitle = 'should not be blocked by route rate limits'

function hasLogoutRateLimitValkeyGlideTimeout(log: string): boolean {
  const normalized = stripAnsi(log)
  return (
    normalized.includes('Failed Tests 1') &&
    normalized.includes('Test Files  1 failed') &&
    normalized.includes(backendLogoutTestPath) &&
    normalized.includes(backendLogoutRouteDescribeTitle) &&
    normalized.includes(backendLogoutRateLimitTestTitle) &&
    normalized.includes('TimeoutError: timed out') &&
    normalized.includes('@valkey/valkey-glide') &&
    normalized.includes('GlideClient.processResponse') &&
    normalized.includes('BaseClient.js')
  )
}

export function hasBackendUnitVitestWorkerUnexpectedExitAfterPassingSummary(log: string): boolean {
  const normalized = stripAnsi(log)
  return (
    normalized.includes('pnpm exec ./ci/with-node-test-options vitest run') &&
    normalized.includes('--project backend') &&
    hasOnlyVitestWorkerExitUnhandledErrors(normalized) &&
    passedTestFilesSummaryPattern.test(normalized) &&
    !failedTestFilesSummaryPattern.test(normalized) &&
    passedTestsSummaryPattern.test(normalized) &&
    !failedTestsSummaryPattern.test(normalized) &&
    normalized.includes('##[error]Process completed with exit code 1.')
  )
}

export const backendUnitValkeyGlideTimeoutRule: TransientRetryRule = {
  id: 'backend-unit-valkey-glide-timeout',
  consumerKey: 'backend-unit-logout-route-test',
  rootCauseKey: 'valkey-glide-timeout',
  description:
    'Backend unit shard fails one logout route test because the Valkey GLIDE client times out.',
  rationale:
    'The failure is an isolated Valkey client timeout in one test shard on a self-hosted runner; the application route did not fail with an assertion, and sibling backend shards completed on the same commit.',
  exampleRunIds: ['28317524553'],
  maxAttempts: 1,
  needsLogs: true,
  match: async ctx => {
    if (ctx.workflowName !== 'Main CI (backend)' || ctx.conclusion !== 'failure') return false
    const jobName = getSoleGenuinelyFailedBackendUnitShard(ctx)
    if (jobName === null) return false

    const logs = await ctx.failedJobLogs()
    return hasLogoutRateLimitValkeyGlideTimeout(logs.get(jobName) ?? '')
  },
}

export const backendUnitVitestWorkerExitAfterPassRule: TransientRetryRule = {
  id: 'backend-unit-vitest-worker-exit-after-pass',
  description:
    'Backend unit shard finishes all Vitest tests successfully, then fails because one or more Vitest worker forks exit unexpectedly.',
  rationale:
    'The backend test summary reports every test file and test passed before Vitest reports an unhandled worker-pool exit; downstream aggregate jobs fail only because the producer exited non-zero.',
  exampleRunIds: ['28656995621'],
  consumerKey: 'backend-unit-vitest',
  rootCauseKey: 'worker-exit-after-pass',
  maxAttempts: 2,
  needsLogs: true,
  // The resolver applies the same shard-identity logic as match() (which already
  // validated that the job is the sole genuinely-failed backend unit shard).
  // Both paths independently call the same helpers; keep them in sync.
  rerunTarget: {
    jobNameFamily: backendUnitJobPrefix,
    resolveJobName: resolveBackendUnitShardJobName,
  },
  match: async ctx => {
    if (
      !['CI', 'Main CI (backend)'].includes(ctx.workflowName) ||
      (ctx.conclusion !== 'failure' && ctx.conclusion !== 'cancelled')
    )
      return false
    const jobName = resolveBackendUnitShardJobName(ctx)
    if (jobName === null) return false

    const logs = await ctx.failedJobLogs()
    return hasBackendUnitVitestWorkerUnexpectedExitAfterPassingSummary(logs.get(jobName) ?? '')
  },
}
