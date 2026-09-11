import { isPlaywrightShardSetupJob, isStorePlaywrightOtelDownstream } from './playwright-rules.mts'
import {
  hasExplicitOomEvidence,
  hasGenericFailureSignal,
  isCleanRunnerShutdown,
} from './runner-shutdown-fingerprints.mts'
import type { TransientRetryRule, WorkflowRunContext } from './types.mts'
import { hasSelfHostedRunnerLostCommunicationAnnotation } from './github-annotation-fingerprints.mts'
import {
  findRunnerShutdownConsumer,
  isCoverageProducerJob,
  playwrightSelectJobName,
  isWebIntegrationShardJob,
} from './runner-shutdown-consumers.mts'
import { isStatefulCiJob } from './stateful-job.mts'
import {
  CI_ALWAYS_AGGREGATE_FAN_IN_JOB_NAMES,
  CI_PATCH_COVERAGE_JOB_NAMES,
} from './ci-aggregate-jobs.mts'

// Idempotent workflows where runner-shutdown of a leaf job is safe to rerun.
// Main CI (storybook) is included: run 32069866705 is an observed runner-shutdown example.
const idempotentWorkflows = new Set([
  'CI',
  'Main CI (backend)',
  'Main CI (checks)',
  'Main CI (storybook)',
  'Main CI (web)',
])

// Jobs that aggregate leaf results — they fail only because a leaf did not complete.

// store-playwright-otel is conditional downstream only when it did not fail on
// its own or when the failed log proves the job only lacked shard artifacts
// because an upstream Playwright shard was killed. Other failed/timed-out store
// jobs may have independent AWS/S3/script failures and must stay in leafJobs.
const storePlaywrightOtelJobName = 'store-playwright-otel'

export const runnerShutdownLeafRerunRule: TransientRetryRule = {
  id: 'runner-shutdown-leaf-rerun',
  consumerKey: 'idempotent-ci-leaf-process',
  rootCauseKey: 'self-hosted-runner-shutdown',
  description:
    'Self-hosted runner receives a shutdown signal before an idempotent CI leaf job completes, causing the leaf and its aggregate fan-ins to fail.',
  rationale:
    'Runner infrastructure terminates the process before tests or the build step complete; every unsuccessful-job log is available and contains no explicit kernel/cgroup OOM evidence, test assertion, setup failure, smoke-test failure, build error, or non-143 (non-SIGTERM) exit code. Downstream aggregate jobs (tests, build) fail only because the leaf did not complete; cancelled sibling consumer jobs with no failure signal are treated as downstream of a failed clean-shutdown leaf; Patch Coverage is treated as downstream only when a coverage-producing leaf failed; store-playwright-otel is treated as downstream only when a Playwright shard failed and the store job was skipped, cancelled, or failed solely because no Playwright OTel artifacts existed.',
  exampleRunUrls: [
    // backend-unit shard shutdown
    'https://github.com/jonathanong/filaments/actions/runs/27846979399',
    // CI web-integration + playwright shard shutdown
    'https://github.com/jonathanong/filaments/actions/runs/27869582352',
    // CI playwright-only shard shutdown
    'https://github.com/jonathanong/filaments/actions/runs/27755229439',
    // Main CI (web) Playwright shard shutdown with downstream missing OTel artifacts
    'https://github.com/jonathanong/filaments/actions/runs/28357299849',
    // Main CI (backend) standalone backend-smoke shutdown with SIGTERM but no operation-canceled line
    'https://github.com/jonathanong/filaments/actions/runs/28552353759',
    // CI Playwright shard shutdown with a cancelled sibling matrix job
    'https://github.com/jonathanong/filaments/actions/runs/28513345722',
    // Main CI (checks) tooling shutdown before Vitest summary
    'https://github.com/jonathanong/filaments/actions/runs/29191951985',
    // Main CI (web) static-web shutdown during next build
    'https://github.com/jonathanong/filaments/actions/runs/30503060858',
    // Main CI (storybook) storybook-build shutdown before the web-storybook Vitest project finished
    'https://github.com/jonathanong/filaments/actions/runs/32069866705',
  ],
  // maxAttempts: 2 tolerates a 2nd consecutive infra flake.  Safe because the
  // per-consumer isConsumerFailure guard prevents masking a real failure on
  // either attempt.  Deliberately raises the deleted per-consumer rules'
  // maxAttempts: 1.
  maxAttempts: 2,
  needsLogs: true,
  needsAnnotations: true,
  match: async (ctx: WorkflowRunContext) => {
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
  },
}
