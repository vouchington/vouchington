import { isAreaGateJob } from './ci-aggregate-jobs.mts'
import type { TransientRetryRule, WorkflowRunContext } from './types.mts'

const setupStepName = 'Set up job'
const failedStepConclusions = new Set(['failure', 'timed_out', 'cancelled'])
// One sentence per unresolved action; the action ref and the reported version are the same
// 40-hex SHA, so tag and branch refs never match.
const unresolvedActionPattern =
  /^Unable to resolve action `[\w.-]+\/[\w.-]+(?:\/[\w./-]+)?@([0-9a-f]{40})`, unable to find version `\1`$/

function isUnresolvedActionError(errorText: string): boolean {
  const sentences = errorText.trim().split(/\.\s+(?=Unable to resolve action )/)
  return sentences.every(sentence => unresolvedActionPattern.test(sentence.replace(/\.$/, '')))
}

function hasOnlyUnresolvedActionErrors(log: string): boolean {
  if (log.includes('##[group]Run')) return false
  const errors = log
    .split('\n')
    .filter(line => line.includes('##[error]'))
    .map(line => line.slice(line.indexOf('##[error]') + '##[error]'.length))
  return errors.length > 0 && errors.every(isUnresolvedActionError)
}

function failedOnlyDuringSetup(ctx: WorkflowRunContext, jobName: string): boolean {
  const failedSteps = (ctx.jobSteps?.get(jobName) ?? []).filter(step =>
    failedStepConclusions.has(step.conclusion ?? ''),
  )
  return failedSteps.length === 1 && failedSteps[0]?.name === setupStepName
}

export const actionResolveSetupRetryRule: TransientRetryRule = {
  id: 'action-resolve-setup-retry',
  consumerKey: 'github-actions-job-setup',
  rootCauseKey: 'action-resolve-unable-to-find-version',
  description:
    'A leaf job fails in Set up job because GitHub reports it cannot resolve a pinned action SHA, before any repository step starts.',
  rationale:
    'GitHub intermittently fails `Getting action download info` for SHAs that exist and that sibling jobs in the same run download successfully. Nothing repository-owned ran, so rerunning the leaf is safe. A SHA that is genuinely missing prints identical text; the single rerun bounds that cost and pull-request CI catches a missing SHA before the merge queue. Tag and branch refs, other setup errors, and any started step fail closed.',
  exampleRunIds: ['41057506796', '41057511594'],
  maxAttempts: 1,
  needsLogs: true,
  match: async ctx => {
    if (ctx.conclusion !== 'failure') return false
    const leafJobs = ctx.failedJobNames.filter(name => !isAreaGateJob(ctx.workflowName, name))
    if (leafJobs.length === 0 || !leafJobs.every(name => failedOnlyDuringSetup(ctx, name)))
      return false

    if ((await ctx.failedJobLogFetchFailures()).size > 0) return false
    const logs = await ctx.failedJobLogs()
    return leafJobs.every(name => hasOnlyUnresolvedActionErrors(logs.get(name) ?? ''))
  },
}
