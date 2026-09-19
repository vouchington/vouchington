import { isPlaywrightShardSetupJob, isStorePlaywrightOtelDownstream } from './playwright-rules.mts'
import {
  hasExplicitOomEvidence,
  hasGenericFailureSignal,
  isCleanRunnerShutdown,
} from './runner-shutdown-fingerprints.mts'
import { hasSelfHostedRunnerLostCommunicationAnnotation } from './github-annotation-fingerprints.mts'
import { isStatefulCiJob } from './stateful-job.mts'
import {
  CI_ALWAYS_AGGREGATE_FAN_IN_JOB_NAMES,
  CI_PATCH_COVERAGE_JOB_NAMES,
} from './ci-aggregate-jobs.mts'
import {
  findRunnerShutdownConsumer,
  isCoverageProducerJob,
  isWebIntegrationShardJob,
  playwrightSelectJobName,
} from './runner-shutdown-consumer-registry.mts'
import type { WorkflowRunContext } from './types.mts'

// Idempotent workflows where a clean self-hosted-runner-shutdown of a leaf job was safe to rerun.
// Retained as a shared predicate (rather than a standalone TransientRetryRule) for
// coverage-artifact-rules.mts's hasOnlyAggregatesOrCleanRunnerShutdowns: on GitHub-hosted, ephemeral,
// single-job-per-VM runners this can never match (isCleanRunnerShutdown requires
// hasRunnerShutdownMarkers, a marker tied to a persistent self-hosted runner agent being told to
// drain mid-job), so it only ever narrows what a coverage rule treats as safe to auto-rerun -- never
// widens it. Kept rather than deleted outright so a real occurrence (if the marker ever does appear)
// still gets tolerated instead of silently blocking a coverage rerun.
const idempotentWorkflows = new Set([
  'CI',
  'Main CI (backend)',
  'Main CI (checks)',
  'Main CI (storybook)',
  'Main CI (web)',
])

const storePlaywrightOtelJobName = 'store-playwright-otel'

export async function runnerShutdownLeafRerunMatch(ctx: WorkflowRunContext): Promise<boolean> {
  if (!idempotentWorkflows.has(ctx.workflowName)) return false
  if (ctx.conclusion !== 'failure' && ctx.conclusion !== 'cancelled') return false
  // Bail on any stateful job — a killed apply or deploy must not be blind-rerun.
  if (ctx.failedJobNames.some(isStatefulCiJob)) return false
  if (!ctx.failedJobNames.some(name => !CI_ALWAYS_AGGREGATE_FAN_IN_JOB_NAMES.has(name)))
    return false

  const nonAggregateFailures = ctx.failedJobNames.filter(
    name =>
      !CI_ALWAYS_AGGREGATE_FAN_IN_JOB_NAMES.has(name) && !CI_PATCH_COVERAGE_JOB_NAMES.has(name),
  )
  const logs = await ctx.failedJobLogs()
  if ((await ctx.failedJobLogFetchFailures?.())?.size) return false
  if ([...logs.values()].some(hasExplicitOomEvidence)) return false
  const webIntegrationJobName = nonAggregateFailures.find(isWebIntegrationShardJob)
  const webIntegrationLog = logs.get(webIntegrationJobName ?? '') ?? ''
  const webIntegrationConsumer = findRunnerShutdownConsumer(webIntegrationJobName ?? '')
  if (
    nonAggregateFailures.length === 1 &&
    webIntegrationJobName !== undefined &&
    nonAggregateFailures[0] === webIntegrationJobName &&
    webIntegrationConsumer !== undefined &&
    !hasGenericFailureSignal(webIntegrationLog) &&
    !webIntegrationConsumer.isConsumerFailure(webIntegrationLog) &&
    (await ctx.failedJobAnnotations(webIntegrationJobName)).some(
      hasSelfHostedRunnerLostCommunicationAnnotation,
    )
  ) {
    return true
  }
  const isCancelledKnownConsumerWithoutFailure = (jobName: string): boolean => {
    if (ctx.jobConclusions?.get(jobName) !== 'cancelled') return false
    const consumer = findRunnerShutdownConsumer(jobName)
    const log = logs.get(jobName) ?? ''
    return (
      consumer !== undefined &&
      log.trim().length > 0 &&
      !hasGenericFailureSignal(log) &&
      !consumer.isConsumerFailure(log)
    )
  }

  // Compute leaf jobs: remove always-aggregate jobs and the conditional
  // Patch Coverage / store-playwright-otel / cancelled consumer jobs only when
  // their own dependency state proves they are downstream of a failed leaf.
  const hasFailedPlaywrightShard = ctx.failedJobNames.some(
    name => isPlaywrightShardSetupJob(name) || name === playwrightSelectJobName,
  )
  const hasFailedCoverageProducer = ctx.failedJobNames.some(isCoverageProducerJob)
  const leafJobs = ctx.failedJobNames.filter(
    name =>
      !CI_ALWAYS_AGGREGATE_FAN_IN_JOB_NAMES.has(name) &&
      !(CI_PATCH_COVERAGE_JOB_NAMES.has(name) && hasFailedCoverageProducer) &&
      !isCancelledKnownConsumerWithoutFailure(name) &&
      !(
        name === storePlaywrightOtelJobName &&
        isStorePlaywrightOtelDownstream(ctx, hasFailedPlaywrightShard, logs)
      ),
  )
  if (leafJobs.length === 0) return false

  // Every leaf must belong to a known consumer and have a clean shutdown.
  // Unknown leaf → dispatch (conservative).
  for (const jobName of leafJobs) {
    const consumer = findRunnerShutdownConsumer(jobName)
    if (!consumer) return false
    const log = logs.get(jobName) ?? ''
    const lostCommunication = (await ctx.failedJobAnnotations(jobName)).some(
      hasSelfHostedRunnerLostCommunicationAnnotation,
    )
    if (
      lostCommunication &&
      log.trim().length > 0 &&
      !hasGenericFailureSignal(log) &&
      !consumer.isConsumerFailure(log)
    )
      continue
    if (!isCleanRunnerShutdown(log, consumer.isConsumerFailure)) return false
  }

  return true
}
