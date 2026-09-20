import { GO_NET_HTTP_TRANSPORT_TRANSIENT_ERROR_MARKERS } from './aws-transport-fingerprints.mts'
import { hasCoverageArtifactSelection } from './coverage-artifact-selection.mts'
import {
  coverageTransportExhaustedSuites,
  hasOnlyCoverageTransportTailFailures,
} from './coverage-transport-exhausted-steps.mts'
import type { TransientRetryRule, WorkflowJobStep, WorkflowRunContext } from './types.mts'
import {
  CI_ALWAYS_AGGREGATE_FAN_IN_JOB_NAMES,
  CI_PATCH_COVERAGE_JOB_NAMES,
} from './ci-aggregate-jobs.mts'
import { runnerShutdownLeafRerunMatch } from './runner-shutdown-consumers.mts'

const coverageArtifactStaleRerunMissingRuleId = 'coverage-artifact-stale-rerun-missing'

function missingCoverageSuites(log: string): string[] {
  return [
    ...log.matchAll(
      /Missing (?:(?:valid )?coverage artifact for [\w-]+: coverage-([\w-]+)\/lcov\.info|expected patch coverage producer group: ([\w-]+))/g,
    ),
  ].map(match => match[1] ?? match[2])
}

function hasGithubArtifactDownloadTransient(
  log: string,
  steps: WorkflowJobStep[] | undefined,
): boolean {
  const attemptMarker = '[optional-run-artifacts] attempt artifact=coverage-'
  const lastAttemptIndex = log.lastIndexOf(attemptMarker)
  const terminalResult = [
    ...log.matchAll(
      /\[optional-run-artifacts\] result=(?:unavailable|error) selector=pattern exit=[1-9][0-9]*/g,
    ),
  ].findLast(match => (match.index ?? -1) > lastAttemptIndex)
  const fallbackDiagnosticWindow = terminalResult?.index
    ? log.slice(lastAttemptIndex, terminalResult.index)
    : ''
  return (
    (lastAttemptIndex !== -1 &&
      terminalResult !== undefined &&
      GO_NET_HTTP_TRANSPORT_TRANSIENT_ERROR_MARKERS.some(marker =>
        fallbackDiagnosticWindow.includes(marker),
      )) ||
    (lastAttemptIndex !== -1 &&
      steps?.some(
        step =>
          step.name === 'Download coverage artifacts from GitHub (fallback)' &&
          step.conclusion === 'timed_out',
      ) === true)
  )
}

function hasEmptyGithubArtifactFallbackDownload(log: string): boolean {
  return (
    log.includes('[optional-run-artifacts] selection selector=pattern count=0') &&
    /\[optional-run-artifacts\] result=(?:unavailable|error) selector=pattern exit=[1-9][0-9]*/.test(
      log,
    ) &&
    log.includes('All coverage jobs passed or were skipped')
  )
}

async function hasOnlyAggregatesOrCleanRunnerShutdowns(
  ctx: WorkflowRunContext,
  failedLogs: Map<string, string>,
  acceptedFailedJobs: ReadonlySet<string> = new Set(),
): Promise<boolean> {
  const failedJobNames = ctx.failedJobNames.filter(
    name => !CI_PATCH_COVERAGE_JOB_NAMES.has(name) && !acceptedFailedJobs.has(name),
  )
  if (failedJobNames.every(name => CI_ALWAYS_AGGREGATE_FAN_IN_JOB_NAMES.has(name))) return true

  const shutdownCtx: WorkflowRunContext = {
    ...ctx,
    failedJobNames,
    failedJobLogs: () => Promise.resolve(failedLogs),
  }
  return runnerShutdownLeafRerunMatch(shutdownCtx)
}

export const coverageTransportExhaustedRule: TransientRetryRule = {
  id: 'coverage-transport-exhausted',
  consumerKey: 'coverage-lcov-upload-artifact',
  rootCauseKey: 'dual-coverage-persistence-failure',
  description:
    'A CI coverage producer fails only in its transport tail after both retried GitHub artifact fallback attempts fail to persist its provenance pair (the shared coverage-transport library always treats the S3 primary leg as skipped in this repo and emits its exhaustion marker once the fallback is exhausted too).',
  rationale:
    'The producer emitted COVERAGE_TRANSPORT_EXHAUSTED, its matching persisted-pair assertion failed, and GitHub reports no failed test, stamp, or unrelated step, so one workflow rerun can recover a transient transport outage without hiding a product failure.',
  exampleRunIds: ['28513421770', '29322555306'],
  maxAttempts: 1,
  needsLogs: true,
  match: async ctx => {
    if (ctx.workflowName !== 'CI' || ctx.conclusion !== 'failure') return false

    const failedLogs = await ctx.failedJobLogs()
    const exhaustedJobs = new Set<string>()
    for (const jobName of ctx.failedJobNames) {
      const suites = coverageTransportExhaustedSuites(failedLogs.get(jobName) ?? '')
      if (suites.length === 0) continue
      if (!hasOnlyCoverageTransportTailFailures(ctx, jobName, suites)) return false
      exhaustedJobs.add(jobName)
    }
    if (exhaustedJobs.size === 0) return false

    return hasOnlyAggregatesOrCleanRunnerShutdowns(ctx, failedLogs, exhaustedJobs)
  },
}

export const coverageArtifactDownloadTimeoutRule: TransientRetryRule = {
  id: 'coverage-artifact-download-timeout',
  consumerKey: 'coverage-artifact-download',
  rootCauseKey: 'github-artifact-download-timeout',
  description:
    'Patch Coverage fails because the GitHub-artifact fallback download times out before downloading every LCOV artifact.',
  rationale:
    'Coverage producers completed and uploaded their GitHub artifact fallbacks, but the Patch Coverage job lost GitHub artifact-download connectivity or exhausted the fallback download step timeout; prepare-coverage-artifacts then failed only because the partial download was incomplete.',
  exampleRunIds: ['33856233270', '30193358422'],
  maxAttempts: 1,
  needsLogs: true,
  match: async ctx => {
    if (ctx.workflowName !== 'CI' || ctx.conclusion !== 'failure') return false
    const testCoverageJobName = ctx.failedJobNames.find(name =>
      CI_PATCH_COVERAGE_JOB_NAMES.has(name),
    )
    if (testCoverageJobName === undefined) return false

    const failedLogs = await ctx.failedJobLogs()
    const patchCoverageLog = failedLogs.get(testCoverageJobName) ?? ''
    const missingSuites = missingCoverageSuites(patchCoverageLog)
    if (missingSuites.length === 0) return false
    if (
      !hasGithubArtifactDownloadTransient(patchCoverageLog, ctx.jobSteps?.get(testCoverageJobName))
    )
      return false

    const everyMissingArtifactWasSelected = missingSuites.every(suite =>
      hasCoverageArtifactSelection(patchCoverageLog, suite),
    )
    if (!everyMissingArtifactWasSelected) return false

    return hasOnlyAggregatesOrCleanRunnerShutdowns(ctx, failedLogs)
  },
}

export const coverageArtifactStaleRerunMissingRule: TransientRetryRule = {
  id: coverageArtifactStaleRerunMissingRuleId,
  consumerKey: 'coverage-artifact-download',
  rootCauseKey: 'stale-github-artifacts-after-delayed-failed-job-rerun',
  description:
    'Patch Coverage fails on a delayed retry because the failed-job rerun reused successful producers from an earlier attempt after their GitHub artifacts were no longer listed (removed by the cleanup sweep or expired).',
  rationale:
    'The Patch Coverage job is rerunning without rerunning the coverage producers, and GitHub reports zero coverage artifacts even though the producer jobs previously succeeded. A full workflow rerun recreates the same-run artifact handoff; there is no dependency or test failure signal for Harness to fix.',
  exampleRunIds: ['30156016854'],
  maxAttempts: 3,
  needsLogs: true,
  match: async ctx => {
    if (ctx.workflowName !== 'CI' || ctx.conclusion !== 'failure') return false
    if (ctx.runAttempt <= 1) return false
    if ((ctx.ruleAttempts?.get(coverageArtifactStaleRerunMissingRuleId) ?? 1) > 1) return false
    const testCoverageJobName = ctx.failedJobNames.find(name =>
      CI_PATCH_COVERAGE_JOB_NAMES.has(name),
    )
    if (testCoverageJobName === undefined) return false

    const failedLogs = await ctx.failedJobLogs()
    const patchCoverageLog = failedLogs.get(testCoverageJobName) ?? ''
    if (missingCoverageSuites(patchCoverageLog).length === 0) return false
    if (!hasEmptyGithubArtifactFallbackDownload(patchCoverageLog)) return false

    return hasOnlyAggregatesOrCleanRunnerShutdowns(ctx, failedLogs)
  },
}
