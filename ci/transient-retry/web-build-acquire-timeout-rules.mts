import {
  isPlaywrightSetupJob,
  isPlaywrightShardSetupJob,
  isStorePlaywrightOtelDownstream,
} from './playwright-rules.mts'
import {
  hasExplicitOomEvidence,
  hasNextBuildFailureSignal,
} from './runner-shutdown-fingerprints.mts'
import { hasExpensiveBuildAcquireTimeout } from './host-lock-fingerprints.mts'
import { buildWebTargetsStepMarker } from './web-build-rules.mts'
import { stripAnsi } from './storybook-shared.mts'
import type { TransientRetryRule } from './types.mts'

import { isIgnorableCancelledSibling } from './cancelled-sibling-leaves.mts'
import { CI_AGGREGATE_FAN_IN_JOB_NAMES } from './ci-aggregate-jobs.mts'
import { isWebIntegrationShardJob } from './runner-shutdown-consumers.mts'

const storePlaywrightOtelJobName = 'store-playwright-otel'
const staticWebJobName = 'static-checks / static-web'

function isBuildWebTargetsJob(name: string): boolean {
  return isPlaywrightSetupJob(name) || isWebIntegrationShardJob(name)
}

// web/package.json's build script wraps `next build` in `VOUCHA_BUILD_LOCK_ON_ACQUIRE_TIMEOUT=fail
// VOUCHA_BUILD_LOCK_WAIT_SECONDS=300 bash ../ci/with-build-lock.sh ...`. When the wrapper fails
// closed it exits 1 before `next build` ever starts, so `next build`'s own start marker is
// required to be absent, not merely unmatched — a compile that starts and then fails for an
// unrelated reason must not be misclassified as lock contention.
function hasBuildWebTargetsAcquireTimeout(log: string): boolean {
  const plainLog = stripAnsi(log)
  // This does not slice from the build-web-targets step marker first: every consumer job (static-web
  // included, since #10990) has many steps after it (test run, coverage upload), so a slice isn't
  // free of its own edge cases either. Scanning the whole log only makes the required absence of
  // `Creating an optimized production build ...` stricter (a stray match anywhere suppresses a
  // legitimate rerun; it can't manufacture a false one), so this is safe, just more conservative.
  return (
    plainLog.includes(buildWebTargetsStepMarker) &&
    hasExpensiveBuildAcquireTimeout(plainLog) &&
    plainLog.includes('Error: pnpm --dir web build failed with exit code 1') &&
    plainLog.includes('##[error]Process completed with exit code 1.') &&
    !plainLog.includes('Creating an optimized production build ...') &&
    !hasNextBuildFailureSignal(plainLog) &&
    !hasExplicitOomEvidence(plainLog)
  )
}

export const mainWebBuildWebTargetsAcquireTimeoutRule: TransientRetryRule = {
  id: 'main-web-build-web-targets-acquire-timeout',
  consumerKey: 'build-web-targets',
  rootCauseKey: 'expensive-build-acquire-timeout',
  description:
    'Main CI web Playwright or web-integration `build-web-targets` Next.js build fails closed waiting for the expensive-build (Next) lock.',
  rationale:
    "web/package.json's build script opts into VOUCHA_BUILD_LOCK_ON_ACQUIRE_TIMEOUT=fail with a 300-second wait so host-side Next builds never overlap. Four jobs share this lock and can be scheduled concurrently on one host, so a queued build that waits out the full 300s fails on contention alone, before `next build` ever starts. A rerun once the lock is free genuinely recovers; this is a distinct root cause from the command/watchdog timeout main-web-build-web-targets-watchdog-timeout covers (#10937).",
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
      leafJobs.every(jobName => hasBuildWebTargetsAcquireTimeout(logs.get(jobName) ?? ''))
    )
  },
}

export const mainWebStaticBuildAcquireTimeoutRule: TransientRetryRule = {
  id: 'main-web-static-build-acquire-timeout',
  consumerKey: 'main-web-next-build',
  rootCauseKey: 'expensive-build-acquire-timeout',
  description:
    'Main CI web static-checks production build fails closed waiting for the expensive-build (Next) lock.',
  rationale:
    'The static-web job now builds through the shared `.github/actions/build-web-targets` composite, like the Playwright and web-integration consumers, under the same fail-closed 300-second acquisition wait. A concurrent expensive-build (Next) consumer on the same host can exhaust that wait before `next build` starts, and a rerun genuinely recovers once the lock is free (#10994). The fingerprint is shared with main-web-build-web-targets-acquire-timeout because both consumers now run the identical composite script and produce identical failure text; only the leaf-job membership differs.',
  maxAttempts: 1,
  needsLogs: true,
  match: async ctx => {
    if (ctx.workflowName !== 'Main CI (web)' || ctx.conclusion !== 'failure') return false

    const logs = await ctx.failedJobLogs()
    // Unlike the build-web-targets rule above, this does not also drop cancelled Playwright
    // siblings or downstream store-playwright-otel — it mirrors the existing static-vs-build-web-
    // targets watchdog split. A run mixing a static-web acquire timeout with one of those dispatches
    // instead of rerunning; that is the safe direction (a missed rerun, never an incorrect one).
    const leafJobs = ctx.failedJobNames.filter(name => !CI_AGGREGATE_FAN_IN_JOB_NAMES.has(name))
    return (
      leafJobs.length > 0 &&
      leafJobs.every(jobName => jobName === staticWebJobName) &&
      hasBuildWebTargetsAcquireTimeout(logs.get(staticWebJobName) ?? '')
    )
  },
}
