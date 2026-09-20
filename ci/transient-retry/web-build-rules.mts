import {
  isPlaywrightSetupJob,
  isPlaywrightShardSetupJob,
  isStorePlaywrightOtelDownstream,
} from './playwright-rules.mts'
import {
  hasMigrationFailureSignal,
  hasPlaywrightFailureSignal,
  hasVitestTestFailureSignal,
  hasWebStackBuildFailureSignal,
  isCleanRunnerShutdown,
} from './runner-shutdown-fingerprints.mts'
import { stripAnsi } from './storybook-shared.mts'
import type { TransientRetryRule } from './types.mts'
import { CI_AGGREGATE_FAN_IN_JOB_NAMES } from './ci-aggregate-jobs.mts'
import {
  buildWebTargetsStepMarker,
  isWebIntegrationShardJob,
} from './runner-shutdown-consumer-registry.mts'
export { buildWebTargetsStepMarker } from './runner-shutdown-consumer-registry.mts'
const storePlaywrightOtelJobName = 'store-playwright-otel'
const staticWebJobName = 'static-checks / static-web'

function hasSilentNextBuildExit(log: string): boolean {
  const plainLog = stripAnsi(log)
  const buildStepIndex = plainLog.indexOf(buildWebTargetsStepMarker)
  if (buildStepIndex === -1) return false
  const buildLog = plainLog.slice(buildStepIndex)
  return (
    buildLog.includes('Creating an optimized production build ...') &&
    buildLog.includes('##[error]Process completed with exit code 1.') &&
    !buildLog.includes('Compiled successfully') &&
    !buildLog.includes('Finished writing to filesystem cache') &&
    !hasWebStackBuildFailureSignal(buildLog)
  )
}
function isCleanWebIntegrationShutdown(log: string): boolean {
  return isCleanRunnerShutdown(
    log,
    candidate =>
      hasVitestTestFailureSignal(candidate) ||
      hasPlaywrightFailureSignal(candidate) ||
      hasWebStackBuildFailureSignal(candidate) ||
      hasMigrationFailureSignal(candidate),
  )
}
function isCleanPlaywrightShutdown(log: string): boolean {
  return isCleanRunnerShutdown(
    log,
    candidate =>
      hasPlaywrightFailureSignal(candidate) ||
      hasWebStackBuildFailureSignal(candidate) ||
      hasMigrationFailureSignal(candidate),
  )
}
function isAllowedCompanionFailure(jobName: string, log: string): boolean {
  if (isWebIntegrationShardJob(jobName)) return isCleanWebIntegrationShutdown(log)
  if (isPlaywrightSetupJob(jobName)) return isCleanPlaywrightShutdown(log)
  return false
}

export const mainWebStaticBuildSilentExitRule: TransientRetryRule = {
  id: 'main-web-static-build-silent-exit',
  consumerKey: 'main-web-next-build',
  rootCauseKey: 'host-resource-exhaustion',
  description:
    'Main CI web static-checks build (`static-checks / static-web`) exits from `next build` without a compiler error.',
  rationale:
    'The static-web job owns the singleton production build independently of the web-tests Vitest shards; Next.js/Turbopack exits without a diagnostic before any compile, type, prerender, or smoke-test failure marker. Companion web-integration or Playwright failures are accepted only when they independently match clean runner shutdown, and the Playwright OTel store is accepted only as downstream of a failed shard.',
  maxAttempts: 1,
  needsLogs: true,
  match: async ctx => {
    if (ctx.workflowName !== 'Main CI (web)' || ctx.conclusion !== 'failure') return false
    if (!ctx.failedJobNames.includes(staticWebJobName)) return false

    const logs = await ctx.failedJobLogs()
    if (!hasSilentNextBuildExit(logs.get(staticWebJobName) ?? '')) return false

    const hasFailedPlaywrightShard = ctx.failedJobNames.some(isPlaywrightShardSetupJob)
    const leafJobs = ctx.failedJobNames.filter(
      name =>
        !CI_AGGREGATE_FAN_IN_JOB_NAMES.has(name) &&
        !(
          name === storePlaywrightOtelJobName &&
          isStorePlaywrightOtelDownstream(ctx, hasFailedPlaywrightShard, logs)
        ),
    )

    return leafJobs.every(
      jobName =>
        jobName === staticWebJobName || isAllowedCompanionFailure(jobName, logs.get(jobName) ?? ''),
    )
  },
}
