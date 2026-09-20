import {
  isPlaywrightSetupJob,
  isPlaywrightShardSetupJob,
  isStorePlaywrightOtelDownstream,
} from './playwright-rules.mts'
import {
  hasMigrationFailureSignal,
  hasPlaywrightFailureSignal,
  hasWebStackBuildFailureSignal,
  isCleanRunnerShutdown,
} from './runner-shutdown-fingerprints.mts'
import type { TransientRetryRule } from './types.mts'
import { webTestsShardPattern } from './runner-shutdown-consumer-registry.mts'
import {
  hasWebVitestSegfault,
  hasWebVitestWorkerStartTimeoutAfterPassingSummary,
} from './web-vitest-log-fingerprints.mts'

import { CI_AGGREGATE_FAN_IN_JOB_NAMES } from './ci-aggregate-jobs.mts'
const storePlaywrightOtelJobName = 'store-playwright-otel'

function singleFailedWebShard(failedJobNames: string[]): string | undefined {
  const shards = failedJobNames.filter(name => webTestsShardPattern.test(name))
  return shards.length === 1 ? shards[0] : undefined
}

function isCleanPlaywrightRunnerShutdown(log: string): boolean {
  return isCleanRunnerShutdown(
    log,
    text =>
      hasPlaywrightFailureSignal(text) ||
      hasWebStackBuildFailureSignal(text) ||
      hasMigrationFailureSignal(text),
  )
}

export const webVitestSigsegvRule: TransientRetryRule = {
  id: 'web-vitest-sigsegv',
  consumerKey: 'web-vitest',
  rootCauseKey: 'native-segfault',
  description: 'Web unit test CI job SIGSEGVs before assertions.',
  rationale:
    'Native crash before test output; the current web project/shard command identifies the producer while avoiding an assumption about whether coverage was enabled.',
  exampleRunIds: ['26764065016'],
  maxAttempts: 1,
  needsLogs: true,
  match: async ctx => {
    if (ctx.workflowName !== 'CI' || ctx.conclusion !== 'failure') return false
    const webTestsJobName = singleFailedWebShard(ctx.failedJobNames)
    if (!webTestsJobName) return false
    if (
      ctx.failedJobNames.some(
        name => name !== webTestsJobName && !CI_AGGREGATE_FAN_IN_JOB_NAMES.has(name),
      )
    ) {
      return false
    }

    const logs = await ctx.failedJobLogs()
    return hasWebVitestSegfault(logs.get(webTestsJobName) ?? '')
  },
}

export const mainWebVitestWorkerStartTimeoutAfterPassRule: TransientRetryRule = {
  id: 'main-web-vitest-worker-start-timeout-after-pass',
  consumerKey: 'main-web-vitest',
  rootCauseKey: 'host-resource-exhaustion',
  description:
    'Main web Vitest finishes all web tests, then fails because a Vitest worker thread does not respond while scheduling a test file.',
  rationale:
    'The web test summary reports every test file and test passed before Vitest reports an unhandled worker-pool startup timeout. In mixed Main CI web failures, simultaneous Playwright leaf failures are accepted only when they independently match clean runner shutdown, and store-playwright-otel is accepted only when it lacks artifacts after a failed Playwright shard.',
  exampleRunIds: ['28513607183'],
  maxAttempts: 1,
  needsLogs: true,
  match: async ctx => {
    if (ctx.workflowName !== 'Main CI (web)' || ctx.conclusion !== 'failure') return false
    const webTestsJobName = singleFailedWebShard(ctx.failedJobNames)
    if (!webTestsJobName) return false

    const logs = await ctx.failedJobLogs()
    const hasFailedPlaywrightShard = ctx.failedJobNames.some(isPlaywrightShardSetupJob)
    const leafJobNames = ctx.failedJobNames.filter(
      name =>
        !CI_AGGREGATE_FAN_IN_JOB_NAMES.has(name) &&
        !(
          name === storePlaywrightOtelJobName &&
          isStorePlaywrightOtelDownstream(ctx, hasFailedPlaywrightShard, logs)
        ),
    )
    if (!leafJobNames.includes(webTestsJobName)) return false
    if (leafJobNames.some(name => name !== webTestsJobName && !isPlaywrightSetupJob(name))) {
      return false
    }

    if (!hasWebVitestWorkerStartTimeoutAfterPassingSummary(logs.get(webTestsJobName) ?? '')) {
      return false
    }

    const playwrightLeafJobNames = leafJobNames.filter(isPlaywrightSetupJob)
    if (
      playwrightLeafJobNames.some(
        jobName => !isCleanPlaywrightRunnerShutdown(logs.get(jobName) ?? ''),
      )
    ) {
      return false
    }

    return true
  },
}
