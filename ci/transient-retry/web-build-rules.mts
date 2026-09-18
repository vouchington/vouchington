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
import { isIgnorableCancelledSibling } from './cancelled-sibling-leaves.mts'
import { CI_AGGREGATE_FAN_IN_JOB_NAMES } from './ci-aggregate-jobs.mts'
import { hasExpensiveBuildProcessGroupSurvivedSigkill } from './host-lock-fingerprints.mts'
import { isWebIntegrationShardJob } from './runner-shutdown-consumers.mts'
import {
  buildWebTargetsStepMarker,
  hasBuildWebTargetsWatchdogTimeout,
} from './web-build-watchdog-fingerprints.mts'
export { buildWebTargetsStepMarker } from './web-build-watchdog-fingerprints.mts'
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
    !hasExpensiveBuildProcessGroupSurvivedSigkill(buildLog) &&
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

function isBuildWebTargetsJob(name: string): boolean {
  return isPlaywrightSetupJob(name) || isWebIntegrationShardJob(name)
}
export const mainWebBuildWebTargetsWatchdogTimeoutRule: TransientRetryRule = {
  id: 'main-web-build-web-targets-watchdog-timeout',
  consumerKey: 'build-web-targets',
  rootCauseKey: 'expensive-build-command-timeout',
  description:
    'Main CI web Playwright or web-integration `build-web-targets` Next.js build is killed by the expensive-build command circuit breaker.',
  rationale:
    '`next build` wall time increased after PR #10794 capped Next.js page-data workers to fix a host OOM; the former 300-second expensive-build command cap was not re-derived for the slower build, so healthy-but-slow builds exceeded it under host pressure. The shared build action now uses an interim 360-second cap while #11093 validates the cgroup-aware build profile and narrows or retires this retry rule; #10937 is the historical phase-one context. Sibling shards on the same commit complete, there is no compiler diagnostic or kernel OOM, and a quieter rerun recovers the build.',
  exampleRunIds: ['33947220513', '33945343955', '33938415433', '33964001099'],
  maxAttempts: 1,
  needsLogs: true,
  match: async ctx => {
    if (ctx.workflowName !== 'Main CI (web)' || ctx.conclusion !== 'failure') return false

    const logs = await ctx.failedJobLogs()
    const logFetchFailures = (await ctx.failedJobLogFetchFailures?.()) ?? new Set()
    const hasFailedPlaywrightShard = ctx.failedJobNames.some(isPlaywrightShardSetupJob)
    const leafJobs = ctx.failedJobNames.filter(
      name =>
        !isIgnorableCancelledSibling(ctx, name, logs, logFetchFailures) &&
        !CI_AGGREGATE_FAN_IN_JOB_NAMES.has(name) &&
        !(
          name === storePlaywrightOtelJobName &&
          isStorePlaywrightOtelDownstream(ctx, hasFailedPlaywrightShard, logs)
        ),
    )
    return (
      leafJobs.length > 0 &&
      leafJobs.every(isBuildWebTargetsJob) &&
      leafJobs.every(jobName => hasBuildWebTargetsWatchdogTimeout(logs.get(jobName) ?? ''))
    )
  },
}

export const mainWebStaticBuildWatchdogTimeoutRule: TransientRetryRule = {
  id: 'main-web-static-build-watchdog-timeout',
  consumerKey: 'main-web-next-build',
  rootCauseKey: 'expensive-build-command-timeout',
  description:
    'Main CI web static-checks production build is killed by the expensive-build command circuit breaker.',
  rationale:
    'The static-web job builds through the shared `.github/actions/build-web-targets` composite, like the Playwright and web-integration consumers. Historical failures reached the former 300-second cap without a compiler diagnostic or kernel OOM; the shared action now uses an interim 360-second cap while #11093 validates the cgroup-aware build profile and narrows or retires this retry rule. #10937 is historical phase-one context. The fingerprint is shared with main-web-build-web-targets-watchdog-timeout because both consumers run the identical composite script and produce identical failure text; only the leaf-job membership differs. (Run 33960272815 shows the pre-migration `pnpm run build` signature and is no longer representative.)',
  maxAttempts: 1,
  needsLogs: true,
  match: async ctx => {
    if (ctx.workflowName !== 'Main CI (web)' || ctx.conclusion !== 'failure') return false

    const logs = await ctx.failedJobLogs()
    const logFetchFailures = (await ctx.failedJobLogFetchFailures?.()) ?? new Set()
    const leafJobs = ctx.failedJobNames.filter(
      name =>
        !isIgnorableCancelledSibling(ctx, name, logs, logFetchFailures) &&
        !CI_AGGREGATE_FAN_IN_JOB_NAMES.has(name),
    )
    return (
      leafJobs.length > 0 &&
      leafJobs.every(jobName => jobName === staticWebJobName) &&
      hasBuildWebTargetsWatchdogTimeout(logs.get(staticWebJobName) ?? '')
    )
  },
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
