import {
  hasCloudflareWorkerTscRuntimeCrash,
  hasOxlintTsgolintRuntimeFault,
} from './static-analysis-log-fingerprints.mts'
import { isAreaGateJob } from './ci-aggregate-jobs.mts'
import type { TransientRetryRule, WorkflowRunContext } from './types.mts'

const staticAnalysisJobName = 'static-code-analysis / static-code-analysis'

function isStaticAnalysisCheckRun(name: string): boolean {
  return name === staticAnalysisJobName
}

function hasOnlyStaticAnalysisAndAggregateFailures(ctx: WorkflowRunContext): boolean {
  if (!ctx.failedJobNames.some(isStaticAnalysisCheckRun)) return false
  return ctx.failedJobNames.every(name => {
    if (isStaticAnalysisCheckRun(name) || isAreaGateJob(ctx.workflowName, name)) {
      return true
    }
    return ctx.jobConclusions?.get(name) === 'cancelled'
  })
}

function hasOnlyNamedJobAndAggregateFailures(ctx: WorkflowRunContext, jobName: string): boolean {
  if (!ctx.failedJobNames.includes(jobName)) return false
  return ctx.failedJobNames.every(name => {
    if (name === jobName || isAreaGateJob(ctx.workflowName, name)) return true
    return ctx.jobConclusions?.get(name) === 'cancelled'
  })
}

export const cloudflareWorkerTscRuntimeCrashRule: TransientRetryRule = {
  id: 'cloudflare-worker-tsc-runtime-unknown-caller-pc',
  consumerKey: 'cloudflare-worker-tsc-typecheck',
  rootCauseKey: 'typescript-go-runtime-crash',
  description:
    'Cloudflare Worker static typecheck fails because the TypeScript-Go runtime crashes with an unknown caller pc.',
  rationale:
    'The failure is a Go runtime crash inside microsoft/typescript-go during parsing, not a TypeScript diagnostic. The typecheck step runs unconditionally in the Static workflow.',
  exampleRunIds: ['26734765264'],
  maxAttempts: 1,
  needsLogs: true,
  match: async ctx => {
    if (ctx.conclusion !== 'failure') return false
    if (ctx.workflowName !== 'Static') return false
    if (!hasOnlyNamedJobAndAggregateFailures(ctx, staticAnalysisJobName)) return false

    const logs = await ctx.failedJobLogs()
    return hasCloudflareWorkerTscRuntimeCrash(logs.get(staticAnalysisJobName) ?? '')
  },
}

export const staticAnalysisOxlintTsgolintRuntimeFaultRule: TransientRetryRule = {
  id: 'static-analysis-oxlint-tsgolint-runtime-fault',
  consumerKey: 'oxlint-type-aware-lint',
  rootCauseKey: 'typescript-go-runtime-crash',
  description:
    'Static analysis fails while oxlint type-aware linting shells out to tsgolint and the embedded TypeScript-Go runtime faults.',
  rationale:
    'The failure is a Go runtime fault inside tsgolint before lint diagnostics; the same oxlint type-aware command passed locally on representative failing commits after a clean pnpm install.',
  // Both runs below predate #8754 (2026-07-29), which wrapped this step in ci/with-heavy-slot.sh —
  // the marker rot that made this rule dead for two months (see PR #10604). Neither run reflects the
  // current step header or the current oxlint-tsgolint traceback shape; replace with a post-drift
  // run the next time this rule actually fires.
  exampleRunIds: ['27465605823', '27951094888'],
  maxAttempts: 1,
  needsLogs: true,
  match: async ctx => {
    if (ctx.workflowName !== 'Static' || ctx.conclusion !== 'failure') return false
    if (!hasOnlyStaticAnalysisAndAggregateFailures(ctx)) return false

    const logs = await ctx.failedJobLogs()
    return hasOxlintTsgolintRuntimeFault(logs.get(staticAnalysisJobName) ?? '')
  },
}
