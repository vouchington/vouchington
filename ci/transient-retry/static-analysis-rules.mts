import {
  hasCloudflareWorkerTscRuntimeCrash,
  hasOxlintTsgolintRuntimeFault,
} from './static-analysis-log-fingerprints.mts'
import { CI_ALWAYS_AGGREGATE_FAN_IN_JOB_NAMES } from './ci-aggregate-jobs.mts'
import type { TransientRetryRule, WorkflowRunContext } from './types.mts'

const staticAnalysisJobName = 'static-code-analysis / static-code-analysis'
const staticAnalysisNoMistakesJobName = 'static-code-analysis / no-mistakes'

// checks-static.yml job `static-cloudflare` runs the Cloudflare Worker tsc step.
// GitHub names a reusable-workflow job `<caller> / <called>`.
export const ciCloudflareWorkerStaticJobName = 'static-cloudflare-worker / static-cloudflare'
export const mainCloudflareWorkerStaticJobName = 'static-checks / static-cloudflare'

const cloudflareWorkerStaticJobByWorkflow = new Map<string, string>([
  ['CI', ciCloudflareWorkerStaticJobName],
  ['Main CI (cloudflare-worker)', mainCloudflareWorkerStaticJobName],
])

function isStaticAnalysisCheckRun(name: string): boolean {
  return name === staticAnalysisJobName || name === staticAnalysisNoMistakesJobName
}

function hasOnlyStaticAnalysisAndAggregateFailures(ctx: WorkflowRunContext): boolean {
  if (!ctx.failedJobNames.some(isStaticAnalysisCheckRun)) return false
  return ctx.failedJobNames.every(name => {
    if (isStaticAnalysisCheckRun(name) || CI_ALWAYS_AGGREGATE_FAN_IN_JOB_NAMES.has(name)) {
      return true
    }
    return ctx.jobConclusions?.get(name) === 'cancelled'
  })
}

function hasOnlyNamedJobAndAggregateFailures(ctx: WorkflowRunContext, jobName: string): boolean {
  if (!ctx.failedJobNames.includes(jobName)) return false
  return ctx.failedJobNames.every(name => {
    if (name === jobName || CI_ALWAYS_AGGREGATE_FAN_IN_JOB_NAMES.has(name)) return true
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
    'The failure is a Go runtime crash inside microsoft/typescript-go during parsing, not a TypeScript diagnostic. The typecheck step runs in checks-static.yml job static-cloudflare.',
  exampleRunIds: ['26734765264'],
  maxAttempts: 1,
  needsLogs: true,
  match: async ctx => {
    if (ctx.conclusion !== 'failure') return false
    const cloudflareJobName = cloudflareWorkerStaticJobByWorkflow.get(ctx.workflowName)
    if (cloudflareJobName === undefined) return false
    if (!hasOnlyNamedJobAndAggregateFailures(ctx, cloudflareJobName)) return false

    const logs = await ctx.failedJobLogs()
    return hasCloudflareWorkerTscRuntimeCrash(logs.get(cloudflareJobName) ?? '')
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
  // current step header or the oxlint-tsgolint@7.0.2001 traceback shape; replace with a post-drift
  // run the next time this rule actually fires.
  exampleRunIds: ['27465605823', '27951094888'],
  maxAttempts: 1,
  needsLogs: true,
  match: async ctx => {
    if (ctx.workflowName !== 'CI' || ctx.conclusion !== 'failure') return false
    if (!hasOnlyStaticAnalysisAndAggregateFailures(ctx)) return false

    const logs = await ctx.failedJobLogs()
    return hasOxlintTsgolintRuntimeFault(logs.get(staticAnalysisJobName) ?? '')
  },
}
