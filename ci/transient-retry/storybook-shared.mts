import type { WorkflowRunContext } from './types.mts'
import { isAreaGateJob } from './ci-aggregate-jobs.mts'

export const ciStorybookJobName = 'storybook / storybook'
export const storybookBrowserAttemptMarker = '[storybook-browser] starting attempt'

export const matchesStorybookSingleJob = (ctx: WorkflowRunContext): boolean =>
  ctx.conclusion === 'failure' &&
  ctx.workflowName === 'Web' &&
  ctx.failedJobNames.includes(ciStorybookJobName) &&
  ctx.failedJobNames.every(
    jobName => jobName === ciStorybookJobName || isAreaGateJob(ctx.workflowName, jobName),
  )

export const failedStorybookJobName = (ctx: WorkflowRunContext): string | undefined => {
  if (ctx.workflowName !== 'Web') return undefined
  const jobName = ciStorybookJobName
  if (ctx.jobConclusions !== undefined) {
    return ctx.jobConclusions.get(jobName) === 'failure' ? jobName : undefined
  }
  return ctx.conclusion === 'failure' && ctx.failedJobNames.includes(jobName) ? jobName : undefined
}

export const hasStorybookBrowserViteDependencyReady = (plainLog: string): boolean =>
  plainLog.includes('dependencies optimized') || /\bhash is consistent\b/i.test(plainLog)

export const hasStorybookBrowserViteReady = (plainLog: string): boolean =>
  hasStorybookBrowserViteDependencyReady(plainLog) ||
  /VITE v\d+\.\d+\.\d+\s*ready in \d+\s*ms/.test(plainLog)

export const storybookViteNewDependenciesMarker = 'new dependencies found:'
export const storybookViteOptimizerReloadMarker = 'optimized dependencies changed. reloading'

export const hasStorybookViteNewDependenciesFound = (plainLog: string): boolean =>
  plainLog.includes(storybookViteNewDependenciesMarker)

export const hasStorybookViteOptimizerReload = (plainLog: string): boolean =>
  plainLog.includes(storybookViteOptimizerReloadMarker)

export const hasStorybookViteOptimizerNewDepsReload = (plainLog: string): boolean =>
  hasStorybookViteNewDependenciesFound(plainLog) && hasStorybookViteOptimizerReload(plainLog)
