import type { WorkflowRunContext } from './types.mts'
import { ciAggregateFailureJobNames } from './ci-aggregate-failure-jobs.mts'

export const storybookJobName = 'storybook-build / storybook'
export const ciStorybookJobName = 'storybook / storybook'
export const storybookBrowserAttemptMarker = '[storybook-browser] starting attempt'

const ansiEscapePattern = new RegExp(String.raw`\u001B\[[0-?]*[ -/]*[@-~]`, 'g')

export const matchesStorybookSingleJob = (ctx: WorkflowRunContext): boolean =>
  ctx.conclusion === 'failure' &&
  ((ctx.workflowName === 'Main CI (storybook)' &&
    ctx.failedJobNames.length === 1 &&
    ctx.failedJobNames[0] === storybookJobName) ||
    (ctx.workflowName === 'CI' &&
      ctx.failedJobNames.includes(ciStorybookJobName) &&
      ctx.failedJobNames.every(
        jobName => jobName === ciStorybookJobName || ciAggregateFailureJobNames.has(jobName),
      )))

export const storybookLogJobName = (ctx: WorkflowRunContext): string =>
  ctx.failedJobNames.includes(ciStorybookJobName) ? ciStorybookJobName : storybookJobName

export const failedStorybookJobName = (ctx: WorkflowRunContext): string | undefined => {
  if (ctx.workflowName !== 'CI' && ctx.workflowName !== 'Main CI (storybook)') return undefined
  const jobName = ctx.workflowName === 'CI' ? ciStorybookJobName : storybookJobName
  if (ctx.jobConclusions !== undefined) {
    return ctx.jobConclusions.get(jobName) === 'failure' ? jobName : undefined
  }
  return ctx.conclusion === 'failure' && ctx.failedJobNames.includes(jobName) ? jobName : undefined
}

export const stripAnsi = (log: string): string => log.replace(ansiEscapePattern, '')

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

export const parseStorybookViteNewDependencies = (plainLog: string): string[] => {
  const names = new Set<string>()
  const pattern = /new dependencies found:\s*([^\n]+)/g
  for (const match of plainLog.matchAll(pattern)) {
    const listed = match[1]
    if (!listed) continue
    for (const name of listed.split(',')) {
      const trimmed = name.trim()
      if (trimmed) names.add(trimmed)
    }
  }
  return [...names]
}
