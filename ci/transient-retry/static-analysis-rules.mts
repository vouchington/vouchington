import {
  hasCloudflareWorkerTscRuntimeCrash,
  hasOxlintTsgolintRuntimeFault,
} from './static-analysis-log-fingerprints.mts'
import { CI_ALWAYS_AGGREGATE_FAN_IN_JOB_NAMES } from './ci-aggregate-jobs.mts'
import type { TransientRetryRule, WorkflowRunContext } from './types.mts'

const staticAnalysisJobName = 'static-code-analysis / static-code-analysis'
const staticAnalysisNoMistakesJobName = 'static-code-analysis / no-mistakes-owned'

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

function staticAnalysisJobLog(logs: Map<string, string>, jobName = staticAnalysisJobName): string {
  return logs.get(jobName) ?? ''
}

function hasStaticAnalysisCheckoutDiskExhaustion(log: string): boolean {
  return (
    log.includes('Run actions/checkout@') &&
    log.includes('Error: ENOSPC: no space left on device, write') &&
    log.includes("code: 'ENOSPC'") &&
    log.includes('file_command_issueFileCommand') &&
    log.includes('/actions/checkout/')
  )
}

export const staticAnalysisCheckoutDiskExhaustionRule: TransientRetryRule = {
  id: 'static-analysis-checkout-enospc',
  consumerKey: 'actions-checkout-static-analysis',
  rootCauseKey: 'self-hosted-runner-disk-exhaustion',
  description:
    'Static analysis fails before repository checkout completes because the self-hosted runner disk is full.',
  rationale:
    'The failure occurs inside actions/checkout while writing GitHub Actions state, before repo code or static analysis commands run; downstream jobs are cancelled only because the producer never started.',
  exampleRunUrls: ['https://github.com/jonathanong/filaments/actions/runs/29220434718'],
  maxAttempts: 1,
  needsLogs: true,
  match: async ctx => {
    if (ctx.workflowName !== 'CI') return false
    if (ctx.conclusion !== 'failure' && ctx.conclusion !== 'cancelled') return false
    if (!hasOnlyStaticAnalysisAndAggregateFailures(ctx)) return false

    const logs = await ctx.failedJobLogs()
    return (
      hasStaticAnalysisCheckoutDiskExhaustion(staticAnalysisJobLog(logs)) ||
      hasStaticAnalysisCheckoutDiskExhaustion(
        staticAnalysisJobLog(logs, staticAnalysisNoMistakesJobName),
      )
    )
  },
}

export const cloudflareWorkerTscRuntimeCrashRule: TransientRetryRule = {
  id: 'cloudflare-worker-tsc-runtime-unknown-caller-pc',
  consumerKey: 'cloudflare-worker-tsc-typecheck',
  rootCauseKey: 'typescript-go-runtime-crash',
  description:
    'Static analysis fails while tsc typechecks the Cloudflare Worker because the TypeScript-Go runtime crashes with an unknown caller pc.',
  rationale:
    'The failure is a Go runtime crash inside microsoft/typescript-go during parsing, not a TypeScript diagnostic; the same Cloudflare Worker tsc command passed locally on the failing commit.',
  exampleRunUrls: ['https://github.com/jonathanong/filaments/actions/runs/26734765264'],
  maxAttempts: 1,
  needsLogs: true,
  match: async ctx => {
    if (ctx.workflowName !== 'CI' || ctx.conclusion !== 'failure') return false
    if (!hasOnlyStaticAnalysisAndAggregateFailures(ctx)) return false

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
  // the marker rot that made this rule dead for two months (see PR #10604). Neither URL reflects the
  // current step header or the oxlint-tsgolint@7.0.2001 traceback shape; replace with a post-drift
  // run the next time this rule actually fires.
  exampleRunUrls: [
    'https://github.com/jonathanong/filaments/actions/runs/27465605823',
    'https://github.com/jonathanong/filaments/actions/runs/27951094888',
  ],
  maxAttempts: 1,
  needsLogs: true,
  match: async ctx => {
    if (ctx.workflowName !== 'CI' || ctx.conclusion !== 'failure') return false
    if (!hasOnlyStaticAnalysisAndAggregateFailures(ctx)) return false

    const logs = await ctx.failedJobLogs()
    return hasOxlintTsgolintRuntimeFault(logs.get(staticAnalysisJobName) ?? '')
  },
}
