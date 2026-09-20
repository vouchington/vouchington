import { hasPlaywrightSetupAptLockFailure } from './playwright-log-fingerprints.mts'
import {
  CI_ALWAYS_AGGREGATE_FAN_IN_JOB_NAMES,
  CI_PATCH_COVERAGE_JOB_NAMES,
} from './ci-aggregate-jobs.mts'
import type { TransientRetryRule, WorkflowRunContext } from './types.mts'

export const storePlaywrightOtelJobName = 'store-playwright-otel'
const setupPlaywrightWorkflowNames = new Set(['CI', 'Main CI (web)', 'Main CI (storybook)'])
const storybookSetupJobNames = new Set(['storybook / storybook', 'storybook-build / storybook'])
export const isPlaywrightShardSetupJob = (name: string): boolean =>
  name.startsWith('test-playwright / playwright-tests (') ||
  name.startsWith('playwright-tests / playwright-tests (')
export const isPlaywrightSetupJob = (name: string): boolean =>
  isPlaywrightShardSetupJob(name) || name.includes('/ playwright-credentialed-tests')
const isSetupPlaywrightJob = (name: string) =>
  isPlaywrightSetupJob(name) || storybookSetupJobNames.has(name)

export function getFailedPlaywrightShardNames(failedJobNames: string[]): string[] | null {
  const hasFailedPlaywrightShardSetupJob = failedJobNames.some(isPlaywrightShardSetupJob)
  const hasFailedStorybookSetupJob = failedJobNames.some(name => storybookSetupJobNames.has(name))
  if (
    failedJobNames.some(
      name =>
        !isSetupPlaywrightJob(name) &&
        !CI_ALWAYS_AGGREGATE_FAN_IN_JOB_NAMES.has(name) &&
        !(name === storePlaywrightOtelJobName && hasFailedPlaywrightShardSetupJob) &&
        !(CI_PATCH_COVERAGE_JOB_NAMES.has(name) && hasFailedStorybookSetupJob),
    )
  ) {
    return null
  }

  const failedPlaywrightShardNames = failedJobNames.filter(name => isSetupPlaywrightJob(name))
  return failedPlaywrightShardNames.length > 0 ? failedPlaywrightShardNames : null
}

export function hasNoPlaywrightOtelArtifacts(log: string): boolean {
  return /(?:^|\s)(?:##\[error\]|::error::)No Playwright OTel artifacts found$/m.test(log)
}

export function isStorePlaywrightOtelDownstream(
  ctx: WorkflowRunContext,
  hasFailedPlaywrightShard: boolean,
  logs: Map<string, string>,
): boolean {
  if (!hasFailedPlaywrightShard) return false
  const conclusion = ctx.jobConclusions?.get(storePlaywrightOtelJobName)
  return (
    conclusion === 'cancelled' ||
    conclusion === 'skipped' ||
    ((conclusion === 'failure' || conclusion === undefined) &&
      hasNoPlaywrightOtelArtifacts(logs.get(storePlaywrightOtelJobName) ?? ''))
  )
}

export function hasPlaywrightAssertionFailureSignal(log: string): boolean {
  return [
    /(^|\n).*Error: expect\(/,
    /(^|\n).*AssertionError:/,
    /(^|\n).*\bFailed Tests\b/,
    /^\s*FAIL\s+/m,
    /(^|\n).*Test timeout of \d+ms exceeded/,
  ].some(pattern => pattern.test(log))
}

function countOccurrences(log: string, marker: string): number {
  let count = 0
  let index = log.indexOf(marker)
  while (index !== -1) {
    count += 1
    index = log.indexOf(marker, index + marker.length)
  }
  return count
}

export const mainWebPlaywrightSetupAptLockRule: TransientRetryRule = {
  id: 'main-web-playwright-setup-apt-lock',
  consumerKey: 'setup-playwright',
  rootCauseKey: 'host-package-manager-lock',
  description:
    'Retry Playwright/Storybook jobs that fail in `Run ./.github/actions/setup-playwright` because of apt/dpkg lock contention or host package-manager lock timeout.',
  rationale:
    "A fresh GitHub-hosted runner's boot-time unattended-upgrades/apt-daily timer can still hold the dpkg lock when a job starts. When the Playwright dependency probe finds host drift, `setup-playwright` repairs it with `playwright install-deps` under the host package-manager lock. APT contention or host-lock timeout can fail that fallback; both are transient.",
  exampleRunIds: ['27805129632'],
  maxAttempts: 1,
  needsLogs: true,
  match: async ctx => {
    if (!setupPlaywrightWorkflowNames.has(ctx.workflowName) || ctx.conclusion !== 'failure')
      return false

    const failedPlaywrightShardNames = getFailedPlaywrightShardNames(ctx.failedJobNames)
    if (!failedPlaywrightShardNames) return false

    const logs = await ctx.failedJobLogs()
    return failedPlaywrightShardNames.every(jobName =>
      hasPlaywrightSetupAptLockFailure(logs.get(jobName) ?? ''),
    )
  },
}

// Exported so repo-owned-literal-freshness.test.mts asserts against this exact literal rather than
// a second, independently-drifting copy (see #10806/#10825).
export const playwrightNavigateToHelperPath = 'playwright/helpers/navigate-to.mts'

function hasMainWebPlaywrightWorkerNavigationTimeout(log: string): boolean {
  const hasPlaywrightRunStarted =
    log.includes('Run Playwright tests') ||
    log.includes('pnpm exec ./ci/with-node-test-options playwright test')
  const retryBudgetExhaustionCount = countOccurrences(
    log,
    'Error: retryOnConnectionLost: connection retry budget exceeded',
  )
  const timeoutErrorCount = countOccurrences(log, 'TimeoutError:')

  return (
    hasPlaywrightRunStarted &&
    /\bRunning \d+ tests using \d+ workers, shard \d+ of \d+\b/.test(log) &&
    log.includes('WARN logger_core: received error - timed out') &&
    !hasPlaywrightAssertionFailureSignal(log) &&
    log.includes('TimeoutError: page.goto:') &&
    log.includes(playwrightNavigateToHelperPath) &&
    retryBudgetExhaustionCount > 0 &&
    timeoutErrorCount <= retryBudgetExhaustionCount &&
    log.includes('##[error]Process completed with exit code 1.')
  )
}

export const mainWebPlaywrightWorkerNavigationTimeoutRule: TransientRetryRule = {
  id: 'main-web-playwright-worker-navigation-timeout',
  consumerKey: 'playwright-navigate-to',
  rootCauseKey: 'workerd-connection-timeout',
  description:
    'Main CI web Playwright shard reaches test execution, then workerd becomes unresponsive and a `navigateTo()` page.goto exhausts the connection retry budget.',
  rationale:
    'The shard had already started the production web stack and completed hundreds of specs; the terminal failure is broad worker/runtime unresponsiveness (`logger_core` timeouts plus `retryOnConnectionLost` budget exhaustion), not a route-specific assertion or build failure. Per-rule attempt accounting gives this fingerprint one retry even when an earlier workflow attempt failed for a different reason.',
  exampleRunIds: ['28527428862'],
  maxAttempts: 1,
  needsLogs: true,
  match: async ctx => {
    if (ctx.workflowName !== 'Main CI (web)' || ctx.conclusion !== 'failure') return false

    const failedPlaywrightShardNames = getFailedPlaywrightShardNames(ctx.failedJobNames)
    if (!failedPlaywrightShardNames) return false

    const logs = await ctx.failedJobLogs()
    if (
      ctx.failedJobNames.includes(storePlaywrightOtelJobName) &&
      !isStorePlaywrightOtelDownstream(ctx, true, logs)
    ) {
      return false
    }

    return failedPlaywrightShardNames.every(jobName =>
      hasMainWebPlaywrightWorkerNavigationTimeout(logs.get(jobName) ?? ''),
    )
  },
}
