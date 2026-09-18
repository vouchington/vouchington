import type { TransientRetryRule, WorkflowRunContext } from './types.mts'
import { isStatefulCiJob } from './stateful-job.mts'

const cloudflareWorkerCancelledBeforeJobSignalRuleId =
  'cloudflare-worker-cancelled-before-job-signal'
const cloudflareWorkerCancelledBeforeJobSignalMaxAttempts = 1

function hasOnlyCancelledJobs(ctx: WorkflowRunContext): boolean {
  const { jobConclusions } = ctx
  if (jobConclusions === undefined) return false
  return ctx.failedJobNames.every(name => jobConclusions.get(name) === 'cancelled')
}

const idempotentWorkflowNames = new Set([
  'CI',
  'Main CI (backend)',
  'Main CI (checks)',
  'Main CI (cloudflare-worker)',
  'Main CI (lambdas)',
  'Main CI (storybook)',
  'Main CI (web)',
  'Portability Tests',
  'Static Code Analysis',
])

function hasPotentiallyStartedStatefulJob(ctx: WorkflowRunContext): boolean {
  const jobNames = new Set([...(ctx.jobNames ?? []), ...ctx.failedJobNames])
  return [...jobNames].some(jobName => {
    if (!isStatefulCiJob(jobName)) return false
    return ctx.jobConclusions?.get(jobName) !== 'skipped'
  })
}

function hasNoCreatedJobs(ctx: WorkflowRunContext): boolean {
  return ctx.failedJobNames.length === 0 && ctx.jobNames?.length === 0
}

function hasKnownCloudflareWorkerNoJobRerunExhaustion(ctx: WorkflowRunContext): boolean {
  const attempts = ctx.ruleAttempts?.get(cloudflareWorkerCancelledBeforeJobSignalRuleId)
  return attempts !== undefined && attempts > cloudflareWorkerCancelledBeforeJobSignalMaxAttempts
}

export const cloudflareWorkerCancelledBeforeJobSignalRule: TransientRetryRule = {
  id: cloudflareWorkerCancelledBeforeJobSignalRuleId,
  consumerKey: 'cloudflare-worker-deploy-workflow',
  rootCauseKey: 'cancelled-before-failure-signal',
  description: 'Cloudflare Worker retry was cancelled before GitHub created deploy jobs.',
  rationale:
    'A jobless Main CI (cloudflare-worker) run cannot have mutated staging state, so there is no deploy or rollback evidence for Harness to fix.',
  exampleRunIds: ['29221718444', '29221555057'],
  maxAttempts: cloudflareWorkerCancelledBeforeJobSignalMaxAttempts,
  match: ctx => {
    if (ctx.conclusion !== 'cancelled') return false
    return ctx.workflowName === 'Main CI (cloudflare-worker)' && hasNoCreatedJobs(ctx)
  },
}

export const workflowCancelledWithoutFailureSignalRule: TransientRetryRule = {
  id: 'workflow-cancelled-without-failure-signal',
  consumerKey: 'github-workflow-run',
  rootCauseKey: 'cancelled-without-failure-signal',
  description:
    'CI retry was cancelled with every unsuccessful job reported as cancelled and no producer job concluding failure.',
  rationale:
    'GitHub cancelled running jobs after the retry was superseded or before any producer job ran; because no job concluded failure or timed_out, the run has no test, build, or deploy failure signal for Harness to fix. Replaces narrower detect-changes and static-analysis-setup allowlist variants that were strict subsets of this no-signal rule.',
  exampleRunIds: [
    '27465574571',
    '27496931635',
    '27497108848',
    '29238912465',
    '29264238528',
    '29273415165',
    '29329916379',
    '30004090583',
  ],
  maxAttempts: Number.MAX_SAFE_INTEGER,
  decision: 'ignore',
  match: ctx => {
    if (ctx.conclusion !== 'cancelled') return false
    if (!idempotentWorkflowNames.has(ctx.workflowName)) return false
    if (hasPotentiallyStartedStatefulJob(ctx)) return false
    if (ctx.failedJobNames.length === 0) {
      if (!hasNoCreatedJobs(ctx)) return false
      if (ctx.workflowName === 'Main CI (cloudflare-worker)') {
        return hasKnownCloudflareWorkerNoJobRerunExhaustion(ctx)
      }
      return true
    }
    return hasOnlyCancelledJobs(ctx)
  },
}
