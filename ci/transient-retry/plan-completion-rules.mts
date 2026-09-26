import { terminalFailedGithubActionsStepLog } from './github-actions-log.mts'
import type { TransientRetryRule } from './types.mts'

const auditJobName = 'audit'
const setupNodeRunGroupPattern = /##\[group\]Run actions\/setup-node@[0-9a-f]{40}\b/
const setupNodeTimeoutPattern =
  /The action 'Run actions\/setup-node@[0-9a-f]{40}' has timed out after /
const nodeVersionsDownloadMarker = 'github.com/actions/node-versions/releases/download/'
const toolCacheAddMarker = 'Adding to the cache ...'

function hasPlanCompletionSetupNodeToolCacheTimeout(log: string): boolean {
  const stepLog = terminalFailedGithubActionsStepLog(log)
  if (!setupNodeRunGroupPattern.test(stepLog)) return false
  if (!stepLog.includes(nodeVersionsDownloadMarker)) return false
  if (!stepLog.includes(toolCacheAddMarker)) return false

  const errorLines = stepLog.split('\n').filter(line => line.includes('##[error]'))
  return errorLines.length === 1 && setupNodeTimeoutPattern.test(errorLines[0] ?? '')
}

function isOnlyFailedPlanCompletionAudit(ctx: {
  workflowName: string
  conclusion: string
  failedJobNames: string[]
}): boolean {
  return (
    ctx.workflowName === 'Plan completion advisory' &&
    ctx.conclusion === 'failure' &&
    ctx.failedJobNames.length === 1 &&
    ctx.failedJobNames[0] === auditJobName
  )
}

export const planCompletionSetupNodeToolCacheTimeoutRule: TransientRetryRule = {
  id: 'plan-completion-setup-node-tool-cache-timeout',
  consumerKey: 'plan-completion-setup-node',
  rootCauseKey: 'github-actions-tool-cache-stall',
  description:
    'Plan completion advisory fails before the audit script because actions/setup-node downloaded Node and then timed out while adding it to the GitHub-hosted tool cache.',
  rationale:
    'The audit command never starts. The only failed job is audit, and the stable fingerprint is a GitHub tool-cache stall after a successful node-versions download, not a plan-completion defect.',
  exampleRunIds: ['36261771483'],
  maxAttempts: 1,
  needsLogs: true,
  match: async ctx => {
    if (!isOnlyFailedPlanCompletionAudit(ctx)) return false

    const logs = await ctx.failedJobLogs()
    return hasPlanCompletionSetupNodeToolCacheTimeout(logs.get(auditJobName) ?? '')
  },
}
